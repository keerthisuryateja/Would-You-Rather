import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './supabaseClient'
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

const DEMO_QUESTION_PAIRS = new Set([
  'eat pizza forever||never eat again',
  'be rich||be famous',
  'never have to sleep||never have to eat',
])

const isDemoQuestion = (q) => {
  const pair = `${(q.option_one ?? '').trim().toLowerCase()}||${(q.option_two ?? '').trim().toLowerCase()}`
  return DEMO_QUESTION_PAIRS.has(pair)
}

const getIconForOption = (text) => {
  const lower = (text ?? '').toLowerCase()
  if (lower.includes('pizza') || lower.includes('food') || lower.includes('eat')) return 'restaurant'
  if (lower.includes('fly') || lower.includes('pterodactyl')) return 'flight'
  if (lower.includes('sleep') || lower.includes('bed')) return 'bed'
  if (lower.includes('money') || lower.includes('rich') || lower.includes('wealthy')) return 'savings'
  if (lower.includes('famous') || lower.includes('celebrity')) return 'emoji_events'
  if (lower.includes('book') || lower.includes('read') || lower.includes('story')) return 'auto_stories'
  if (lower.includes('hamster') || lower.includes('pet') || lower.includes('animal')) return 'pets'
  return 'emoji_objects'
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
        const liveQuestions = normalized.filter((item) => !isDemoQuestion(item))

        if (liveQuestions.length === 0) {
          setQuestions([])
          setCurrentQuestion(null)
          setStatusMessage('Only demo rows were found in Supabase. Replace seeded rows with your own questions.')
          return
        }

        setQuestions(liveQuestions)
        if (preserveCurrent) {
          setCurrentQuestion((prev) => {
            const preserved = liveQuestions.find((item) => item.id === prev?.id)
            return preserved ?? getRandomQuestion(liveQuestions)
          })
        } else {
          pickRandomQuestion(liveQuestions)
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

  const getTotalVotes = (q) => (q.votes_one ?? 0) + (q.votes_two ?? 0)
  const getPercentage = (votes, total) => (total === 0 ? 0 : Math.round((votes / total) * 100))

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
    <div className="bg-background font-body text-on-background min-h-screen flex flex-col overflow-x-hidden">
      {/* TopAppBar */}
      <header className="flex justify-between items-center w-full px-6 py-4 fixed top-0 z-50 bg-blue-600 dark:bg-blue-700 shadow-[0px_4px_20px_rgba(8,70,237,0.3)]">
        <div className="flex items-center gap-4">
          <span className="text-yellow-400 dark:text-yellow-300 italic font-black text-3xl tracking-tighter drop-shadow-[4px_4px_0px_rgba(0,0,0,0.15)] font-headline">
            WYR?
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 bg-blue-700 px-4 py-2 rounded-full text-white/90 font-label text-sm border-2 border-white/20 hover:scale-105 transition-transform">
            <span className="material-symbols-outlined text-yellow-400" style={{fontSize: '20px'}}>
              emoji_events
            </span>
            <span className="tracking-widest">420</span>
          </button>
          <div className="w-10 h-10 rounded-full border-4 border-yellow-400 overflow-hidden shadow-[4px_4px_0px_#000] hover:scale-105 hover:rotate-2 transition-transform cursor-pointer">
            <div className="w-full h-full bg-primary-container flex items-center justify-center text-white font-bold" title="Profile">
              P1
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 bg-blue-700 dark:bg-blue-800 h-1 w-full"></div>
      </header>

      <main className="flex-grow pt-24 pb-32 px-6 max-w-5xl mx-auto w-full flex flex-col">
        {/* Game Controls Row */}
        <div className="flex justify-between items-center mb-10 mt-4">
          <div className="flex flex-col">
            <span className="font-label text-xs uppercase tracking-[0.2em] text-primary font-bold">
              Daily Challenge
            </span>
            <h1 className="font-headline text-4xl text-on-surface leading-none -mt-1">EPIC CHOICES!</h1>
          </div>
          <div className="flex items-center gap-3 bg-surface-container-high p-1.5 rounded-full border-2 border-on-surface/5">
            <span className="font-label text-[10px] px-3 font-bold text-on-surface-variant uppercase">
              {isSupabaseConfigured ? 'Live Mode' : 'Offline'}
            </span>
            <button className="w-14 h-8 bg-tertiary-fixed rounded-full relative flex items-center border-2 border-on-tertiary-fixed transition-all active:scale-95">
              <div className="w-6 h-6 bg-white rounded-full ml-1 shadow-sm flex items-center justify-center">
                <div className="w-2 h-2 bg-tertiary rounded-full animate-pulse"></div>
              </div>
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className="bg-yellow-100 border-2 border-yellow-400 rounded-full px-6 py-3 mb-6 text-center font-body text-sm">
            {statusMessage}
          </div>
        )}

        {loading ? (
          <div className="flex-grow flex items-center justify-center">
            <div className="animate-spin w-16 h-16 border-4 border-primary border-t-yellow-400 rounded-full"></div>
          </div>
        ) : !currentQuestion ? (
          <div className="flex-grow flex items-center justify-center">
            <div className="text-center">
              <h2 className="font-headline text-2xl mb-4">No Questions Available</h2>
              <p className="mb-6 text-on-surface-variant">Add questions to your Supabase table to get started.</p>
              <button
                onClick={() => fetchQuestions({ preserveCurrent: false })}
                className="bg-gradient-to-br from-primary to-primary-container px-8 py-3 rounded-full text-white font-headline text-lg shadow-[0_10px_20px_rgba(8,70,237,0.3)] border-b-4 border-primary-dim hover:translate-y-[-2px] active:translate-y-[1px] transition-all"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Choice Arena */}
            <div className="flex flex-col md:flex-row gap-6 relative items-center justify-center flex-grow">
              {/* Choice Card A */}
              <button
                onClick={() => handleVote(1)}
                disabled={hasVoted}
                className="w-full md:w-1/2 min-h-[280px] md:h-full bg-surface-container-lowest border-[3px] border-primary-dim rounded-full p-8 flex flex-col items-center justify-center text-center relative group cursor-pointer hover:scale-[1.02] transition-all overflow-hidden disabled:cursor-default disabled:hover:scale-100"
              >
                <div className="absolute inset-0 comic-texture text-primary opacity-[0.03] pointer-events-none"></div>
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-secondary-container rounded-2xl border-4 border-on-secondary-container shadow-[6px_6px_0px_#000] rotate-[-6deg] mb-6 flex items-center justify-center mx-auto group-hover:rotate-0 transition-transform">
                    <span 
                      className="material-symbols-outlined text-on-secondary-container text-3xl"
                      style={{fontSize: '32px'}}
                    >
                      {getIconForOption(currentQuestion.option_one)}
                    </span>
                  </div>
                  <p className="font-headline text-2xl md:text-3xl text-on-surface leading-tight px-4">
                    {currentQuestion.option_one}
                  </p>
                </div>

                {/* Percent Bar (shown when voted) */}
                {hasVoted && (
                  <div className="absolute bottom-6 left-0 right-0 px-6 opacity-100 transition-opacity">
                    <div className="w-full h-3 bg-surface-container-high rounded-full overflow-hidden border-2 border-on-surface">
                      <div className="h-full bg-secondary-container" style={{ width: `${p1}%` }}></div>
                    </div>
                    <span className="font-label text-xs mt-2 block font-black text-on-surface">{p1}% AGREE</span>
                  </div>
                )}
              </button>

              {/* VS Badge */}
              <div className="md:absolute z-20 flex items-center justify-center my-[-2rem] md:my-0">
                <div className="w-20 h-20 bg-on-background rounded-full border-[6px] border-white flex items-center justify-center shadow-[0_10px_25px_rgba(0,0,0,0.2)] rotate-12">
                  <span className="font-headline text-3xl text-white italic tracking-tighter">OR</span>
                </div>
              </div>

              {/* Choice Card B */}
              <button
                onClick={() => handleVote(2)}
                disabled={hasVoted}
                className="w-full md:w-1/2 min-h-[280px] md:h-full bg-surface-container-lowest border-[3px] border-tertiary-dim rounded-full p-8 flex flex-col items-center justify-center text-center relative group cursor-pointer hover:scale-[1.02] transition-all overflow-hidden disabled:cursor-default disabled:hover:scale-100"
              >
                <div className="absolute inset-0 comic-texture text-tertiary opacity-[0.03] pointer-events-none"></div>
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-tertiary-container rounded-2xl border-4 border-on-tertiary-container shadow-[6px_6px_0px_#000] rotate-[6deg] mb-6 flex items-center justify-center mx-auto group-hover:rotate-0 transition-transform">
                    <span 
                      className="material-symbols-outlined text-on-tertiary-container text-3xl"
                      style={{fontSize: '32px'}}
                    >
                      {getIconForOption(currentQuestion.option_two)}
                    </span>
                  </div>
                  <p className="font-headline text-2xl md:text-3xl text-on-surface leading-tight px-4">
                    {currentQuestion.option_two}
                  </p>
                </div>

                {/* Percent Bar (shown when voted) */}
                {hasVoted && (
                  <div className="absolute bottom-6 left-0 right-0 px-6 opacity-100 transition-opacity">
                    <div className="w-full h-3 bg-surface-container-high rounded-full overflow-hidden border-2 border-on-surface">
                      <div className="h-full bg-tertiary-container" style={{ width: `${p2}%` }}></div>
                    </div>
                    <span className="font-label text-xs mt-2 block font-black text-on-surface">{p2}% AGREE</span>
                  </div>
                )}
              </button>
            </div>

            {/* Next Section */}
            <div className="mt-10 flex flex-col items-center gap-4">
              {!hasVoted ? (
                <button
                  onClick={() => pickRandomQuestion(questions)}
                  className="bg-gradient-to-br from-primary to-primary-container px-12 py-5 rounded-full text-white font-headline text-2xl tracking-wide shadow-[0_15px_30px_rgba(8,70,237,0.4)] border-b-8 border-primary-dim hover:translate-y-[-4px] active:translate-y-[2px] active:border-b-0 transition-all flex items-center gap-3 group"
                >
                  SKIP THIS ONE
                  <span className="material-symbols-outlined group-hover:translate-x-2 transition-transform">arrow_forward</span>
                </button>
              ) : (
                <button
                  onClick={() => pickRandomQuestion(questions)}
                  className="bg-gradient-to-br from-primary to-primary-container px-12 py-5 rounded-full text-white font-headline text-2xl tracking-wide shadow-[0_15px_30px_rgba(8,70,237,0.4)] border-b-8 border-primary-dim hover:translate-y-[-4px] active:translate-y-[2px] active:border-b-0 transition-all flex items-center gap-3 group"
                >
                  NEXT QUESTION
                  <span className="material-symbols-outlined group-hover:translate-x-2 transition-transform">arrow_forward</span>
                </button>
              )}
              <p className="font-label text-[10px] text-on-surface-variant/60 tracking-[0.3em]">SCROLL FOR MORE WILD QUESTIONS</p>
            </div>

            {/* Doodle Divider */}
            <div className="mt-20 self-start w-32 h-2 bg-tertiary rounded-full rotate-[-2deg]"></div>
            <div className="mt-2 self-start w-16 h-2 bg-secondary-container rounded-full rotate-[4deg] ml-4"></div>
          </>
        )}
      </main>

      {/* BottomNavBar */}
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-end px-4 pb-6 pt-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t-4 border-blue-600/10 shadow-[0_-10px_30px_rgba(0,0,0,0.1)] rounded-t-[2rem]">
        <a
          className="flex flex-col items-center justify-center bg-yellow-400 dark:bg-yellow-500 text-blue-900 rounded-2xl px-5 py-2 scale-110 -translate-y-2 border-2 border-blue-900 shadow-[4px_4px_0px_#000] active:scale-90 transition-transform duration-200"
          href="#"
          aria-label="Daily challenges"
        >
          <span className="material-symbols-outlined" style={{fontSize: '24px', fontVariationSettings: "'FILL' 1"}}>
            today
          </span>
          <span className="font-label font-bold text-[10px] uppercase tracking-widest mt-1">Daily</span>
        </a>
        <a
          className="flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 px-4 py-2 opacity-70 hover:opacity-100 hover:text-blue-600 transition-all active:scale-90 duration-200"
          href="#"
          aria-label="Wild challenges"
        >
          <span className="material-symbols-outlined" style={{fontSize: '24px'}}>
            auto_awesome
          </span>
          <span className="font-label font-bold text-[10px] uppercase tracking-widest mt-1">Wild</span>
        </a>
        <a
          className="flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 px-4 py-2 opacity-70 hover:opacity-100 hover:text-blue-600 transition-all active:scale-90 duration-200"
          href="#"
          aria-label="School challenges"
        >
          <span className="material-symbols-outlined" style={{fontSize: '24px'}}>
            school
          </span>
          <span className="font-label font-bold text-[10px] uppercase tracking-widest mt-1">School</span>
        </a>
        <a
          className="flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 px-4 py-2 opacity-70 hover:opacity-100 hover:text-blue-600 transition-all active:scale-90 duration-200"
          href="#"
          aria-label="Party challenges"
        >
          <span className="material-symbols-outlined" style={{fontSize: '24px'}}>
            celebration
          </span>
          <span className="font-label font-bold text-[10px] uppercase tracking-widest mt-1">Party</span>
        </a>
      </nav>

      {/* Floating Doodle Texture Decor */}
      <div className="fixed top-1/4 right-[-20px] w-40 h-40 border-8 border-tertiary-fixed opacity-10 rounded-full pointer-events-none"></div>
      <div className="fixed bottom-1/4 left-[-30px] w-60 h-60 border-8 border-primary-container opacity-10 rotate-45 pointer-events-none"></div>
    </div>
  )
}

export default App
