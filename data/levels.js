const LEVELS = [
  {
    num: 1, title: 'Foundation', subtitle: 'Wrist strength, shoulder mobility, basic ring hangs, rows, and push-ups',
    exercises: [
      { key: 'wrist_warmup', name: 'Wrist Warm-Up', rx: '10 circles each direction, then 10 flexion/extension pulses', video: 'https://www.youtube.com/watch?v=fPrirk5JELI' },
      { key: 'ring_dead_hang', name: 'Ring Dead Hang', rx: 'Accumulate 1 min (build to unbroken) · 3–5 sets', hasTimer: true },
      { key: 'ring_rows', name: 'Ring Rows', rx: '8–12 reps · 3–5 sets', video: 'https://www.youtube.com/watch?v=wC5LeDNJ1ro' },
      { key: 'push_ups', name: 'Push-Ups', rx: '10–20 reps · 3–5 sets', video: 'https://www.youtube.com/watch?v=rLTVcV6KlQ8' },
      { key: 'scapula_pulls', name: 'Scapula Pull-Ups', rx: '8–12 reps · 3 sets', video: 'https://www.youtube.com/watch?v=M-giOri8mMI' },
      { key: 'ring_support', name: 'Ring Support Hold', rx: 'Accumulate 30 sec (build to 1 min) · 3–5 sets', video: 'https://www.youtube.com/watch?v=wIUBfclF6Fs', hasTimer: true },
    ],
    graduation: 'Complete 5 sets of: 1-min ring dead hang (unbroken), 10 ring rows, 20 push-ups, and 30-sec ring support hold. All sets should feel relatively comfortable.'
  },
  {
    num: 2, title: 'Pull & Push', subtitle: 'Pull-ups, bar dips, false grip hangs, and your first transition rows',
    exercises: [
      { key: 'wrist_warmup_2', name: 'Wrist Warm-Up', rx: '10 circles each direction + 10 flexion/extension pulses', video: 'https://www.youtube.com/watch?v=fPrirk5JELI' },
      { key: 'pull_ups', name: 'Pull-Ups', rx: '5–8 reps · 3–5 sets', video: 'https://www.youtube.com/watch?v=J1tA_KvAa6o' },
      { key: 'bar_dips', name: 'Bar Dips', rx: '8–12 reps · 3–5 sets', video: 'https://www.youtube.com/watch?v=Cc42gTpLIms' },
      { key: 'false_grip_hang', name: 'False Grip Hang', rx: 'Accumulate 30 sec (build to 1 min) · 3–5 sets', video: 'https://www.youtube.com/watch?v=F_1JBdKJf-4', hasTimer: true },
      { key: 'transition_rows', name: 'High Ring Rows (Transition Rows)', rx: '6–10 reps · 3–5 sets', video: 'https://www.youtube.com/watch?v=poBkFVAesrE' },
      { key: 'ring_support_2', name: 'Ring Support Hold (Turnout)', rx: '30 sec hold with turnout · 3 sets', video: 'https://www.youtube.com/watch?v=wIUBfclF6Fs', hasTimer: true },
    ],
    graduation: 'Complete: 8 strict pull-ups, 10 bar dips, 30-second false grip hang (unbroken), and 6 controlled transition rows. All in a single session.'
  },
  {
    num: 3, title: 'False Grip Integration', subtitle: 'False grip pull-ups, ring dips with turn out, and bent arm holds',
    exercises: [
      { key: 'wrist_warmup_3', name: 'Wrist Warm-Up + False Grip Prep', rx: '10 circles + 10 false grip squeezes', video: 'https://www.youtube.com/watch?v=fPrirk5JELI' },
      { key: 'false_grip_pullups', name: 'False Grip Pull-Ups', rx: '3–6 reps · 4–5 sets', video: 'https://www.youtube.com/watch?v=5R07lItt9EY' },
      { key: 'ring_dips', name: 'Ring Dips (Turnout at Top)', rx: '6–10 reps · 3–5 sets', video: 'https://www.youtube.com/watch?v=wf8tAi6sfps' },
      { key: 'false_grip_rows', name: 'False Grip Ring Rows', rx: '8–10 reps · 3 sets', video: 'https://www.youtube.com/watch?v=wC5LeDNJ1ro' },
      { key: 'bent_arm_hold', name: 'Bent Arm Hold (Bottom of Dip)', rx: 'Hold 10 sec · 3–5 sets', video: 'https://www.youtube.com/watch?v=3PbCufQo_Yc', hasTimer: true },
      { key: 'ring_support_turnout', name: 'Ring Support with Full Turnout', rx: '30 sec hold · 3 sets', hasTimer: true },
    ],
    graduation: 'Complete: 5 false grip pull-ups, 8 ring dips (with turnout), and 3 × 10-second bent arm holds at bottom of dip position. All in one session.'
  },
  {
    num: 4, title: 'Eccentric Control', subtitle: 'Tempo negative muscle ups — learning the full movement pattern under load',
    exercises: [
      { key: 'wrist_warmup_4', name: 'Wrist Warm-Up + Mobility', rx: '10 circles + 1 min false grip hang', video: 'https://www.youtube.com/watch?v=fPrirk5JELI', hasTimer: true },
      { key: 'false_grip_pullups_4', name: 'False Grip Pull-Ups (Chest to Rings)', rx: '4–6 reps · 4 sets', video: 'https://www.youtube.com/watch?v=5R07lItt9EY' },
      { key: 'negative_muscle_ups', name: 'Negative Muscle Ups (5-sec Descent)', rx: '3–5 reps · 3–4 sets', video: 'https://www.youtube.com/watch?v=vSv_TOU3fhk' },
      { key: 'deep_ring_dips', name: 'Deep Ring Dips', rx: '6–8 reps · 3 sets', video: 'https://www.youtube.com/watch?v=wf8tAi6sfps' },
      { key: 'russian_dips', name: 'Russian Dips', rx: '4–6 reps · 3 sets', video: 'https://www.youtube.com/watch?v=KjlY4PGqWj8' },
    ],
    graduation: 'Complete 3 controlled 5-second negative muscle ups (from support to dead hang, smooth and controlled through the transition).'
  },
  {
    num: 5, title: 'First Muscle Up', subtitle: 'Putting it all together. Your first clean, strict ring muscle up',
    exercises: [
      { key: 'wrist_warmup_5', name: 'Wrist Warm-Up + False Grip Prep', rx: '10 circles + 30 sec false grip hang', hasTimer: true },
      { key: 'false_grip_pull_high', name: 'False Grip Pull to Chest', rx: '3–5 reps (pull as high as possible) · 4 sets', video: 'https://www.youtube.com/watch?v=5R07lItt9EY' },
      { key: 'muscle_up_attempts', name: 'Muscle Up Attempts', rx: '5–10 attempts with full intent · rest 2 min between', video: 'https://www.youtube.com/watch?v=1_CIqS7CfwE' },
      { key: 'transition_catch', name: 'Transition Catch Drills', rx: '5–8 reps · 3 sets', video: 'https://www.youtube.com/watch?v=jzuFGnitfE4' },
      { key: 'deep_dips_5', name: 'Deep Ring Dips', rx: '8–10 reps · 3 sets', video: 'https://www.youtube.com/watch?v=wf8tAi6sfps' },
    ],
    graduation: 'Record 1 clean, strict ring muscle up on video. Minimal hip pike, no kipping, no swinging. The pull, transition, and press to support should be controlled.'
  },
  {
    num: 6, title: 'Conditioning', subtitle: 'Building volume, endurance, and bulletproof technique',
    exercises: [
      { key: 'muscle_up_sets', name: 'Muscle Up Sets', rx: '3 reps · 5 sets (2 min rest between sets)', video: 'https://www.youtube.com/watch?v=6JcvbbIgvwc', hasTimer: true },
      { key: 'muscle_up_emom', name: 'Muscle Up EMOM', rx: '1 muscle up every minute for 10 minutes', hasTimer: true },
      { key: 'ring_strength', name: 'Ring Strength Complex', rx: '1 muscle up + 3 ring dips + 5 sec support hold · 3 rounds', video: 'https://www.youtube.com/watch?v=6JcvbbIgvwc', hasTimer: true },
    ],
    graduation: 'Record 5 consecutive strict ring muscle ups on video. Congratulations — you have earned your muscle up.'
  },
];

module.exports = LEVELS;
