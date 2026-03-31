import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './supabaseClient'
import brandLogo from './assets/would_you_rather_logo.png'
import './App.css'

const getRandomQuestion = (qList, excludeId = -1) => {
  let nextQuestions = qList.filter((q) => q.id !== excludeId)
  if (nextQuestions.length === 0) nextQuestions = qList
  return nextQuestions[Math.floor(Math.random() * nextQuestions.length)]
}

const normalizeQuestion = (q) => ({
  ...q,
  votes_one: Number(q.votes_one ?? 0),
  votes_two: Number(q.votes_two ?? 0),
})

function App() {
  const [questions, setQuestions] = useState([])
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('voting')
  const [statusMessage, setStatusMessage] = useState('')

  const pickRandomQuestion = useCallback((qList) => {
    setCurrentQuestion((prev) => getRandomQuestion(qList, prev?.id ?? -1))
    setHasVoted(false)
    setView('voting')
  }, [])

  const fetchQuestions = useCallback(async (options = { preserveCurrent: false }) => {
    const { preserveCurrent } = options
    setLoading(true)
    setStatusMessage('')

    if (!isSupabaseConfigured) {
      setQuestions([])
      setCurrentQuestion(null)
      setLoading(false)
      setStatusMessage('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to run live polls.')
      return
    }

    try {
      const { data, error } = await supabase
        .from('questions')
        .select('id, option_one, option_two, votes_one, votes_two')
        .order('id', { ascending: true })

      if (error || !data || data.length === 0) {
        setQuestions([])
        setCurrentQuestion(null)
        setStatusMessage('No questions found in Supabase table questions.')
      } else {
        const normalized = data.map(normalizeQuestion)
        setQuestions(normalized)
        if (preserveCurrent) {
          setCurrentQuestion((prev) => {
            const preserved = normalized.find((item) => item.id === prev?.id)
            return preserved ?? getRandomQuestion(normalized)
          })
        } else {
          pickRandomQuestion(normalized)
        }
      }
    } catch (err) {
      console.error('Could not fetch questions.', err)
      setQuestions([])
      setCurrentQuestion(null)
      setStatusMessage('Could not reach Supabase. Check URL, key, and table permissions.')
    } finally {
      setLoading(false)
    }
  }, [pickRandomQuestion])

  useEffect(() => {
    fetchQuestions()
  }, [fetchQuestions])

  const handleVote = async (option) => {
    if (!currentQuestion || hasVoted) return

    setHasVoted(true)
    setView('results')

    // Optimistic UI update
    const updatedQuestion = { ...currentQuestion }
    if (option === 1) updatedQuestion.votes_one += 1
    else updatedQuestion.votes_two += 1

    setCurrentQuestion(updatedQuestion)
    setQuestions((prev) => prev.map((q) => (q.id === updatedQuestion.id ? updatedQuestion : q)))

    // Update real database if configured
    try {
      if (isSupabaseConfigured) {
        const column = option === 1 ? 'votes_one' : 'votes_two'
        const { error: rpcError } = await supabase.rpc('increment_vote', {
          row_id: currentQuestion.id,
          col_name: column,
        })

        if (rpcError) {
          const { error: updateError } = await supabase
            .from('questions')
            .update({ [column]: updatedQuestion[column] })
            .eq('id', currentQuestion.id)

          if (updateError) throw updateError
        }

        const { data: latestQuestion, error: latestError } = await supabase
          .from('questions')
          .select('id, option_one, option_two, votes_one, votes_two')
          .eq('id', currentQuestion.id)
          .single()

        if (latestError) throw latestError

        const normalizedLatest = normalizeQuestion(latestQuestion)
        setCurrentQuestion(normalizedLatest)
        setQuestions((prev) => prev.map((q) => (q.id === normalizedLatest.id ? normalizedLatest : q)))
      }
    } catch (e) {
      console.error('Vote update failed', e)
      setStatusMessage('Vote sync failed. Refresh to load the latest server results.')
    }
  }

  const { totalVotes, p1, p2 } = useMemo(() => {
    const votes = currentQuestion ? currentQuestion.votes_one + currentQuestion.votes_two : 0
    const optionOnePercent = votes === 0 ? 50 : Math.round(((currentQuestion?.votes_one ?? 0) / votes) * 100)
    const optionTwoPercent = votes === 0 ? 50 : Math.round(((currentQuestion?.votes_two ?? 0) / votes) * 100)

    return {
      totalVotes: votes,
      p1: optionOnePercent,
      p2: optionTwoPercent,
    }
  }, [currentQuestion])

  return (
    <div className="app-container">
      <div className="header-shell">
        <div className="header">
          <img className="brand-logo" src={brandLogo} alt="Would You Rather logo" />
          <h1><span className="title-gradient">Would You</span> Rather?</h1>
          <p>Vote live. See real community results.</p>
        </div>
        <div className="meta-row">
          <span className="meta-pill">{isSupabaseConfigured ? 'Live mode' : 'Config needed'}</span>
          <button className="refresh-btn" onClick={() => fetchQuestions({ preserveCurrent: true })}>
            Refresh
          </button>
        </div>
        {statusMessage ? <p className="status-message">{statusMessage}</p> : null}
      </div>

      <div className="game-card">
        {loading ? (
          <div className="loader">
            <div className="spinner" aria-label="Loading questions" />
          </div>
        ) : !currentQuestion ? (
          <div className="empty-state">
            <h2>No live questions available</h2>
            <p>Check your Supabase config and confirm the questions table has rows.</p>
            <button className="next-btn" onClick={() => fetchQuestions({ preserveCurrent: false })}>
              Try Again
            </button>
          </div>
        ) : (
          <div className={`view ${view === 'results' ? 'view-results' : 'view-voting'}`}>
            {!hasVoted ? (
              <div className="options-container">
                <button className="option-btn option-1" onClick={() => handleVote(1)} aria-label="Vote for option one">
                  {currentQuestion.option_one}
                </button>
                <div className="or-divider">OR</div>
                <button className="option-btn option-2" onClick={() => handleVote(2)} aria-label="Vote for option two">
                  {currentQuestion.option_two}
                </button>
              </div>
            ) : (
              <div className="results-view">
                <div className="result-bar-container" aria-label="Option one result">
                  <div className="result-text">
                    <span>{currentQuestion.option_one}</span>
                    <span>{p1}%</span>
                  </div>
                  <div className="result-fill fill-1" style={{ width: `${p1}%` }} />
                </div>

                <div className="result-bar-container">
                  <div className="result-text">
                    <span>{currentQuestion.option_two}</span>
                    <span>{p2}%</span>
                  </div>
                  <div className="result-fill fill-2" style={{ width: `${p2}%` }} />
                </div>

                <p className="votes-text">Total votes: {totalVotes.toLocaleString()}</p>

                <button className="next-btn" onClick={() => pickRandomQuestion(questions)}>
                  Next Question <span aria-hidden="true">{'->'}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
