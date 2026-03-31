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

const CATEGORY_KEYWORDS = {
  wild: ['dragon', 'alien', 'superpower', 'magic', 'time', 'future', 'past', 'invisible', 'mind', 'fly', 'pterodactyl'],
  school: ['school', 'study', 'exam', 'homework', 'teacher', 'college', 'class', 'learn', 'skill', 'language', 'book'],
  party: ['party', 'dance', 'music', 'dj', 'celebration', 'festival', 'club', 'karaoke', 'friends'],
}

const CATEGORY_META = {
  daily: { label: 'Daily', icon: 'today' },
  wild: { label: 'Wild', icon: 'auto_awesome' },
  school: { label: 'School', icon: 'school' },
  party: { label: 'Party', icon: 'celebration' },
}

const inferCategory = (question) => {
  const text = `${question.option_one ?? ''} ${question.option_two ?? ''}`.toLowerCase()

  if (CATEGORY_KEYWORDS.wild.some((keyword) => text.includes(keyword))) return 'wild'
  if (CATEGORY_KEYWORDS.school.some((keyword) => text.includes(keyword))) return 'school'
  if (CATEGORY_KEYWORDS.party.some((keyword) => text.includes(keyword))) return 'party'
  return 'daily'
}

const attachCategory = (question) => ({
  ...question,
  category: inferCategory(question),
})

const filterQuestionsByCategory = (qList, category) => {
  if (category === 'daily') return qList
  return qList.filter((item) => item.category === category)
}

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
  const [allQuestions, setAllQuestions] = useState([])
  const [questions, setQuestions] = useState([])
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [liveMode, setLiveMode] = useState(isSupabaseConfigured)
  const [activeCategory, setActiveCategory] = useState('daily')
  const [loading, setLoading] = useState(true)
  const [statusMessage, setStatusMessage] = useState('')

  const pickRandomQuestion = useCallback((qList) => {
    setCurrentQuestion((prev) => getRandomQuestion(qList, prev?.id ?? -1))
    setHasVoted(false)
  }, [])

  const applyCategoryView = useCallback((sourceQuestions, category, preserveCurrent = false) => {
    const scoped = filterQuestionsByCategory(sourceQuestions, category)
    setQuestions(scoped)

    if (scoped.length === 0) {
      setCurrentQuestion(null)
      setHasVoted(false)
      const categoryLabel = CATEGORY_META[category].label
      setStatusMessage(`No ${categoryLabel} questions found. Add more rows or choose another tab.`)
      return
    }

    if (preserveCurrent) {
      setCurrentQuestion((prev) => {
        const preserved = scoped.find((item) => item.id === prev?.id)
        return preserved ?? getRandomQuestion(scoped)
      })
    } else {
      setCurrentQuestion((prev) => getRandomQuestion(scoped, prev?.id ?? -1))
      setHasVoted(false)
    }
  }, [])

  const fetchQuestions = useCallback(async (options = { preserveCurrent: false }) => {
    const { preserveCurrent } = options
    setLoading(true)
    setStatusMessage('')

    if (!isSupabaseConfigured) {
      setAllQuestions([])
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
        setAllQuestions([])
        setQuestions([])
        setCurrentQuestion(null)
        setStatusMessage('No questions found in Supabase table questions.')
      } else {
        const normalized = data.map(normalizeQuestion)
        const liveQuestions = normalized.filter((item) => !isDemoQuestion(item))

        if (liveQuestions.length === 0) {
          setAllQuestions([])
          setQuestions([])
          setCurrentQuestion(null)
          setStatusMessage('Only demo rows were found in Supabase. Replace seeded rows with your own questions.')
          return
        }

        const categorized = liveQuestions.map(attachCategory)
        setAllQuestions(categorized)
        applyCategoryView(categorized, activeCategory, preserveCurrent)
      }
    } catch (err) {
      console.error('Could not fetch questions.', err)
      setAllQuestions([])
      setQuestions([])
      setCurrentQuestion(null)
      setStatusMessage('Could not reach Supabase. Check URL, key, and table permissions.')
    } finally {
      setLoading(false)
    }
  }, [activeCategory, applyCategoryView])

  useEffect(() => {
    fetchQuestions()
  }, [fetchQuestions])

  useEffect(() => {
    if (allQuestions.length > 0 && !loading) {
      applyCategoryView(allQuestions, activeCategory, true)
    }
  }, [activeCategory, allQuestions, applyCategoryView, loading])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    if (liveMode) {
      setStatusMessage('')
      return
    }
    setStatusMessage('Live mode is off. Votes are local until you turn live mode back on.')
  }, [liveMode])

  const handleVote = async (option) => {
    if (!currentQuestion || hasVoted) return

    setHasVoted(true)

    // Optimistic UI update
    const updatedQuestion = { ...currentQuestion }
    if (option === 1) updatedQuestion.votes_one += 1
    else updatedQuestion.votes_two += 1

    setCurrentQuestion(updatedQuestion)
    setQuestions((prev) => prev.map((q) => (q.id === updatedQuestion.id ? updatedQuestion : q)))

    // Update real database if configured
    try {
      if (isSupabaseConfigured && liveMode) {
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
        setAllQuestions((prev) => prev.map((q) => (q.id === normalizedLatest.id ? { ...q, ...normalizedLatest } : q)))
      }
    } catch (e) {
      console.error('Vote update failed', e)
      setStatusMessage('Vote sync failed. Refresh to load the latest server results.')
    }
  }

  const { p1, p2 } = useMemo(() => {
    const votes = currentQuestion ? currentQuestion.votes_one + currentQuestion.votes_two : 0
    const optionOnePercent = votes === 0 ? 50 : Math.round(((currentQuestion?.votes_one ?? 0) / votes) * 100)
    const optionTwoPercent = votes === 0 ? 50 : Math.round(((currentQuestion?.votes_two ?? 0) / votes) * 100)

    return {
      p1: optionOnePercent,
      p2: optionTwoPercent,
    }
  }, [currentQuestion])

  return (
    <div className="bg-background font-body text-on-background min-h-screen flex flex-col overflow-x-hidden">
      {/* TopAppBar */}
      <header className="flex justify-between items-center w-full px-3 sm:px-6 py-3 sm:py-4 fixed top-0 z-50 bg-blue-600 dark:bg-blue-700 shadow-[0px_4px_20px_rgba(8,70,237,0.3)]">
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="text-yellow-400 dark:text-yellow-300 italic font-black text-xl sm:text-3xl tracking-tighter drop-shadow-[4px_4px_0px_rgba(0,0,0,0.15)] font-headline">
            WYR?
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button className="flex items-center gap-1 sm:gap-2 bg-blue-700 px-2 sm:px-4 py-2 rounded-full text-white/90 font-label text-xs sm:text-sm border-2 border-white/20 hover:scale-105 transition-transform">
            <span className="material-symbols-outlined text-yellow-400 hidden sm:inline-block" style={{fontSize: '20px'}}>
              emoji_events
            </span>
            <span className="tracking-widest text-xs sm:text-sm">420</span>
          </button>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 sm:border-4 border-yellow-400 overflow-hidden shadow-[2px_2px_0px_#000] sm:shadow-[4px_4px_0px_#000] hover:scale-105 hover:rotate-2 transition-transform cursor-pointer">
            <div className="w-full h-full bg-primary-container flex items-center justify-center text-white font-bold text-xs sm:text-sm" title="Profile">
              P1
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 bg-blue-700 dark:bg-blue-800 h-1 w-full"></div>
      </header>

      <main className="flex-grow pt-20 sm:pt-24 pb-32 px-3 sm:px-6 max-w-6xl mx-auto w-full flex flex-col">
        {/* Game Controls Row */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-10 mt-2 sm:mt-4 gap-4 sm:gap-0">
          <div className="flex flex-col">
            <span className="font-label text-xs uppercase tracking-[0.2em] text-primary font-bold">
              Daily Challenge
            </span>
            <h1 className="font-headline text-2xl sm:text-4xl text-on-surface leading-none -mt-1">EPIC CHOICES!</h1>
          </div>
          <div className="flex items-center gap-3 bg-surface-container-high p-1.5 rounded-full border-2 border-on-surface/5">
            <span className="font-label text-[10px] px-2 sm:px-3 font-bold text-on-surface-variant uppercase">
              {liveMode ? 'Live Mode' : 'Offline'}
            </span>
            <button
              onClick={() => {
                if (!isSupabaseConfigured) {
                  setStatusMessage('Supabase is not configured, so live mode cannot be enabled.')
                  return
                }
                setLiveMode((prev) => !prev)
              }}
              type="button"
              aria-pressed={liveMode}
              className={`w-14 h-8 rounded-full relative flex items-center border-2 transition-all active:scale-95 ${
                liveMode
                  ? 'bg-tertiary-fixed border-on-tertiary-fixed justify-start'
                  : 'bg-surface-container border-outline-variant justify-end'
              }`}
            >
              <div className="w-6 h-6 bg-white rounded-full mx-1 shadow-sm flex items-center justify-center">
                <div className="w-2 h-2 bg-tertiary rounded-full animate-pulse"></div>
              </div>
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className="bg-yellow-100 border-2 border-yellow-400 rounded-full px-4 sm:px-6 py-2 sm:py-3 mb-4 sm:mb-6 text-center font-body text-xs sm:text-sm">
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
            <div className="flex flex-col lg:flex-row gap-3 sm:gap-6 relative items-center justify-center flex-grow">
              {/* Choice Card A */}
              <button
                onClick={() => handleVote(1)}
                disabled={hasVoted}
                className="w-full lg:w-1/2 h-auto min-h-[220px] sm:min-h-[280px] bg-surface-container-lowest border-[3px] border-primary-dim rounded-2xl sm:rounded-full p-4 sm:p-8 flex flex-col items-center justify-center text-center relative group cursor-pointer hover:scale-[1.02] transition-all overflow-hidden disabled:cursor-default disabled:hover:scale-100"
              >
                <div className="absolute inset-0 comic-texture text-primary opacity-[0.03] pointer-events-none"></div>
                <div className="relative z-10 w-full">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 bg-secondary-container rounded-lg sm:rounded-2xl border-2 sm:border-4 border-on-secondary-container shadow-[3px_3px_0px_#000] sm:shadow-[6px_6px_0px_#000] rotate-[-6deg] mb-4 sm:mb-6 flex items-center justify-center mx-auto group-hover:rotate-0 transition-transform">
                    <span 
                      className="material-symbols-outlined text-on-secondary-container"
                      style={{fontSize: '24px'}}
                    >
                      {getIconForOption(currentQuestion.option_one)}
                    </span>
                  </div>
                  <p className="font-headline text-lg sm:text-2xl md:text-3xl text-on-surface leading-tight px-2 sm:px-4">
                    {currentQuestion.option_one}
                  </p>
                </div>

                {/* Percent Bar (shown when voted) */}
                {hasVoted && (
                  <div className="absolute bottom-3 sm:bottom-6 left-0 right-0 px-4 sm:px-6 opacity-100 transition-opacity">
                    <div className="w-full h-2 sm:h-3 bg-surface-container-high rounded-full overflow-hidden border-2 border-on-surface">
                      <div className="h-full bg-secondary-container" style={{ width: `${p1}%` }}></div>
                    </div>
                    <span className="font-label text-[9px] sm:text-xs mt-1 sm:mt-2 block font-black text-on-surface">{p1}% AGREE</span>
                  </div>
                )}
              </button>

              {/* VS Badge */}
              <div className="lg:absolute z-20 flex items-center justify-center my-[-1rem] lg:my-0">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-on-background rounded-full border-4 sm:border-[6px] border-white flex items-center justify-center shadow-[0_10px_25px_rgba(0,0,0,0.2)] rotate-12">
                  <span className="font-headline text-2xl sm:text-3xl text-white italic tracking-tighter">OR</span>
                </div>
              </div>

              {/* Choice Card B */}
              <button
                onClick={() => handleVote(2)}
                disabled={hasVoted}
                className="w-full lg:w-1/2 h-auto min-h-[220px] sm:min-h-[280px] bg-surface-container-lowest border-[3px] border-tertiary-dim rounded-2xl sm:rounded-full p-4 sm:p-8 flex flex-col items-center justify-center text-center relative group cursor-pointer hover:scale-[1.02] transition-all overflow-hidden disabled:cursor-default disabled:hover:scale-100"
              >
                <div className="absolute inset-0 comic-texture text-tertiary opacity-[0.03] pointer-events-none"></div>
                <div className="relative z-10 w-full">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 bg-tertiary-container rounded-lg sm:rounded-2xl border-2 sm:border-4 border-on-tertiary-container shadow-[3px_3px_0px_#000] sm:shadow-[6px_6px_0px_#000] rotate-[6deg] mb-4 sm:mb-6 flex items-center justify-center mx-auto group-hover:rotate-0 transition-transform">
                    <span 
                      className="material-symbols-outlined text-on-tertiary-container"
                      style={{fontSize: '24px'}}
                    >
                      {getIconForOption(currentQuestion.option_two)}
                    </span>
                  </div>
                  <p className="font-headline text-lg sm:text-2xl md:text-3xl text-on-surface leading-tight px-2 sm:px-4">
                    {currentQuestion.option_two}
                  </p>
                </div>

                {/* Percent Bar (shown when voted) */}
                {hasVoted && (
                  <div className="absolute bottom-3 sm:bottom-6 left-0 right-0 px-4 sm:px-6 opacity-100 transition-opacity">
                    <div className="w-full h-2 sm:h-3 bg-surface-container-high rounded-full overflow-hidden border-2 border-on-surface">
                      <div className="h-full bg-tertiary-container" style={{ width: `${p2}%` }}></div>
                    </div>
                    <span className="font-label text-[9px] sm:text-xs mt-1 sm:mt-2 block font-black text-on-surface">{p2}% AGREE</span>
                  </div>
                )}
              </button>
            </div>

            {/* Next Section */}
            <div className="mt-6 sm:mt-10 flex flex-col items-center gap-2 sm:gap-4">
              {!hasVoted ? (
                <button
                  onClick={() => pickRandomQuestion(questions)}
                  className="bg-gradient-to-br from-primary to-primary-container px-6 sm:px-12 py-3 sm:py-5 rounded-full text-white font-headline text-lg sm:text-2xl tracking-wide shadow-[0_15px_30px_rgba(8,70,237,0.4)] border-b-4 sm:border-b-8 border-primary-dim hover:translate-y-[-4px] active:translate-y-[2px] active:border-b-0 transition-all flex items-center gap-2 sm:gap-3 group"
                >
                  SKIP THIS ONE
                  <span className="material-symbols-outlined group-hover:translate-x-2 transition-transform text-lg sm:text-2xl">arrow_forward</span>
                </button>
              ) : (
                <button
                  onClick={() => pickRandomQuestion(questions)}
                  className="bg-gradient-to-br from-primary to-primary-container px-6 sm:px-12 py-3 sm:py-5 rounded-full text-white font-headline text-lg sm:text-2xl tracking-wide shadow-[0_15px_30px_rgba(8,70,237,0.4)] border-b-4 sm:border-b-8 border-primary-dim hover:translate-y-[-4px] active:translate-y-[2px] active:border-b-0 transition-all flex items-center gap-2 sm:gap-3 group"
                >
                  NEXT QUESTION
                  <span className="material-symbols-outlined group-hover:translate-x-2 transition-transform text-lg sm:text-2xl">arrow_forward</span>
                </button>
              )}
              <p className="font-label text-[9px] sm:text-[10px] text-on-surface-variant/60 tracking-[0.3em]">
                {`SCROLL FOR MORE ${CATEGORY_META[activeCategory].label.toUpperCase()} QUESTIONS`}
              </p>
            </div>

            {/* Doodle Divider */}
            <div className="mt-12 sm:mt-20 self-start w-28 sm:w-32 h-1.5 sm:h-2 bg-tertiary rounded-full rotate-[-2deg]"></div>
            <div className="mt-1.5 sm:mt-2 self-start w-12 sm:w-16 h-1.5 sm:h-2 bg-secondary-container rounded-full rotate-[4deg] ml-3 sm:ml-4"></div>
          </>
        )}
      </main>

      {/* BottomNavBar */}
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-end px-2 sm:px-4 pb-4 sm:pb-6 pt-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t-4 border-blue-600/10 shadow-[0_-10px_30px_rgba(0,0,0,0.1)] rounded-t-[1.5rem] sm:rounded-t-[2rem]">
        {Object.entries(CATEGORY_META).map(([key, meta]) => {
          const isActive = activeCategory === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveCategory(key)}
              aria-label={`${meta.label} challenges`}
              className={isActive
                ? 'flex flex-col items-center justify-center bg-yellow-400 dark:bg-yellow-500 text-blue-900 rounded-lg sm:rounded-2xl px-3 sm:px-5 py-1.5 sm:py-2 scale-100 sm:scale-110 -translate-y-1 sm:-translate-y-2 border-2 border-blue-900 shadow-[2px_2px_0px_#000] sm:shadow-[4px_4px_0px_#000] active:scale-90 transition-transform duration-200'
                : 'flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 px-2 sm:px-4 py-1.5 sm:py-2 opacity-70 hover:opacity-100 hover:text-blue-600 transition-all active:scale-90 duration-200'}
            >
              <span className="material-symbols-outlined text-sm sm:text-2xl" style={{ fontSize: '20px' }}>
                {meta.icon}
              </span>
              <span className="font-label font-bold text-[8px] sm:text-[10px] uppercase tracking-widest mt-0.5">{meta.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Floating Doodle Texture Decor */}
      <div className="fixed top-1/4 right-[-20px] sm:right-[-40px] w-32 sm:w-40 h-32 sm:h-40 border-4 sm:border-8 border-tertiary-fixed opacity-10 rounded-full pointer-events-none"></div>
      <div className="fixed bottom-1/4 left-[-30px] sm:left-[-60px] w-48 sm:w-60 h-48 sm:h-60 border-4 sm:border-8 border-primary-container opacity-10 rotate-45 pointer-events-none"></div>
    </div>
  )
}

export default App
