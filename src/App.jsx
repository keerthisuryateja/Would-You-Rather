import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './supabaseClient'
import brandLogo from './assets/would_you_rather_logo.png'
import './App.css'

const FALLBACK_QUESTIONS = [
  { id: 1, option_one: 'Time travel to the past', option_two: 'Time travel to the future', votes_one: 120, votes_two: 85 },
  { id: 2, option_one: 'Fly like a bird', option_two: 'Breathe underwater', votes_one: 200, votes_two: 150 },
  { id: 3, option_one: 'Never have to sleep', option_two: 'Never have to eat', votes_one: 400, votes_two: 120 },
  { id: 4, option_one: 'Read minds', option_two: 'Be invisible', votes_one: 310, votes_two: 290 },
]

const getRandomQuestion = (qList, excludeId = -1) => {
  let nextQuestions = qList.filter((q) => q.id !== excludeId)
  if (nextQuestions.length === 0) nextQuestions = qList
  return nextQuestions[Math.floor(Math.random() * nextQuestions.length)]
}

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

  const fetchQuestions = useCallback(async () => {
    setLoading(true)
    setStatusMessage('')

    if (!isSupabaseConfigured) {
      setQuestions(FALLBACK_QUESTIONS)
      pickRandomQuestion(FALLBACK_QUESTIONS)
      setLoading(false)
      setStatusMessage('Running with local fallback questions. Configure Supabase for live data.')
      return
    }

    try {
      const { data, error } = await supabase.from('questions').select('*')

      if (error || !data || data.length === 0) {
        setQuestions(FALLBACK_QUESTIONS)
        pickRandomQuestion(FALLBACK_QUESTIONS)
        setStatusMessage('No remote questions found. Showing fallback questions.')
      } else {
        setQuestions(data)
        pickRandomQuestion(data)
      }
    } catch (err) {
      console.warn('Fallback: Using local questions due to error.', err)
      setQuestions(FALLBACK_QUESTIONS)
      pickRandomQuestion(FALLBACK_QUESTIONS)
      setStatusMessage('Could not reach Supabase. Showing fallback questions.')
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

    // Update real database if configured
    try {
      if (isSupabaseConfigured) {
        const column = option === 1 ? 'votes_one' : 'votes_two'
        await supabase.rpc('increment_vote', { row_id: currentQuestion.id, col_name: column })
      }
    } catch (e) {
      console.error('Vote update failed', e)
      setStatusMessage('Vote sync failed. Your vote is still shown locally.')
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
      <div className="header">
        <img className="brand-logo" src={brandLogo} alt="Would You Rather logo" />
        <h1><span className="title-gradient">Would You</span> Rather?</h1>
        <p>Make your choice and see what the world thinks!</p>
        {statusMessage ? <p className="status-message">{statusMessage}</p> : null}
      </div>

      <div className="game-card">
        {loading || !currentQuestion ? (
          <div className="loader">
            <div className="spinner" aria-label="Loading questions" />
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
