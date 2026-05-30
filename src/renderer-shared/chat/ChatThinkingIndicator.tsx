import React, { useCallback, useEffect, useState } from 'react'

const THINKING_PHRASES = [
  'Bribing the brain cells',
  'Teaching the robots to dance',
  'Untangling the headphones',
  'Up, up and away',
  'Cha-chinging some ideas',
  'Warming up the hamsters',
  'Powering through it',
  'Beep-boop, computing',
  'Cha-ching and a prayer',
  'Easy come, easy go',
  'Cashing in some thoughts',
  'Feeding the idea goblins',
  'Cooking it like it’s hot',
  'Consulting the rubber duck',
  'Herding a few stray neurons',
  'Booting up the brain hamsters',
  'Doing a little think-dance',
  'Brb, thinking',
  'Polishing the punchline',
  'Greasing the thought gears',
  'Waking up the wise owls',
  'Hold the line, please',
  'Negotiating with my neurons',
  'Stretching before the heavy lifting',
  'Loading the good stuff',
  'Springing into action',
  'Convincing the gremlins to behave',
  'Shuffling the idea deck',
  'Tuning the thinking radio',
  'Almost got it',
  'Rounding up the loose thoughts',
  'Caffeinating the algorithms',
  'Doing the brainy hokey-pokey',
  'Pause and ponder',
  'Pestering the smart neurons',
  'Wrangling some wild ideas',
  'Defragging my brain',
  'Give me a sec',
  'Sharpening the mental pencils',
  'Asking the office plant',
  'Spinning up the idea blender',
  'Thinking cap on',
  'Nudging the lazy synapses',
  'Reading between the lines',
  'Polishing my crystal ball',
  'Computing the vibes',
  'Coaxing the answer out',
  'Doing some mental gymnastics',
  'Whispering to the algorithms',
  'Brain loading',
  'Stacking the building blocks',
  'Charging the idea batteries',
  'Consulting the wise toaster',
  'Sharpening the pixels',
  'Lassoing a clever thought',
  'Warming up the think muscles',
  'Knocking on wisdom’s door',
  'Plotting greatness',
  'Petting the algorithm cat',
  'Untangling a thought knot',
  'Brewing a fresh idea',
  'Cooking something up',
  'Dusting off the brain books',
  'Rallying the neuron troops',
  'Doing the thinky shuffle',
  'On the case',
  'Squeezing the idea sponge',
  'Flipping through the mind files',
  'Bargaining with the brain fog',
  'Gears turning',
  'Summoning a smart thought',
  'Polishing the lightbulb',
  'Feeding the curious cats',
  'Almost cooked',
  'Spinning the wisdom wheel',
  'Tickling the imagination',
  'Rebooting the daydream',
  'Nearly nailed it',
  'Chasing a runaway idea',
  'Loading wit, please hold',
  'Buttering up the brain',
  'Magic in progress',
  'Stirring the thought soup',
  'Recruiting some bright sparks',
  'Doing a quick brain stretch',
  'Weaving an answer',
  'Tapping the idea keg',
  'Counting clever sheep',
  'Polishing my act',
  'Big think happening',
  'Shaking out the cobwebs',
  'Befriending the brain bots',
  'Hatching a tiny plan',
  'Smart mode engaged',
  'Threading the thought needle',
  'Cranking the genius lever',
  'The wheels are turning',
  'Wrapping up a bright idea',
  'Doodling in the margins of my mind',
  'Polishing the final touch',
]

function pickRandom(phrases: string[], exclude: string): string {
  const filtered = phrases.filter((p) => p !== exclude)
  return filtered[Math.floor(Math.random() * filtered.length)]
}

export function ThinkingIndicator(): React.JSX.Element {
  const [phrase, setPhrase] = useState(() =>
    THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)]
  )
  const [visible, setVisible] = useState(true)

  const rotate = useCallback(() => {
    setVisible(false)
    setTimeout(() => {
      setPhrase((prev) => pickRandom(THINKING_PHRASES, prev))
      setVisible(true)
    }, 400)
  }, [])

  useEffect(() => {
    const id = setInterval(rotate, 7000)
    return () => clearInterval(id)
  }, [rotate])

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 0',
      }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'var(--accent)',
              animation: `typing-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            background: 'linear-gradient(90deg, var(--text-muted) 0%, var(--accent-hover) 50%, var(--text-muted) 100%)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: 'shimmer 2s linear infinite',
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.4s ease',
          }}
        >
          {phrase}...
        </span>
      </div>
    </div>
  )
}
