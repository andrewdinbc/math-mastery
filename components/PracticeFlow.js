'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import styles from './PracticeFlow.module.css';

// Fixed a real schema-mismatch bug: this previously treated
// microUnit.question_template as if it were a bare array of multiple-
// choice questions (question_template[i].options) - the real shape is
// {questions: [...patterns], randomizable_ranges: {...}} with fill-in-the-
// blank prompt/answer_formula questions, no options at all. This likely
// meant online practice never actually worked.
//
// Also adds real per-question AI feedback (checks each answer immediately
// via /api/check-answer, shows a hint if wrong, before moving to the next
// question) instead of batch-marking everything silently at the end.

const QUESTION_COUNT = 10;

function fillOneInstance(pattern, template) {
  if (!template.randomizable_ranges) return { ...pattern, resolvedVariables: {} };
  const vars = {};
  for (const [key, range] of Object.entries(template.randomizable_ranges)) {
    vars[key] = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
  }
  let prompt = pattern.prompt;
  for (const [key, val] of Object.entries(vars)) {
    prompt = prompt.replaceAll(`{${key}}`, val);
  }
  return { ...pattern, prompt, resolvedVariables: vars };
}

function buildPracticeQuestions(template, count) {
  const patterns = template?.questions || [];
  if (patterns.length === 0) return [];
  const questions = [];
  for (let i = 0; i < count; i++) {
    questions.push(fillOneInstance(patterns[i % patterns.length], template));
  }
  return questions;
}

export default function PracticeFlow({ microUnit, studentId }) {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [questions, setQuestions] = useState([]);
  const [stage, setStage] = useState('loading'); // loading, question, feedback, result, error
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answerInput, setAnswerInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [lastResult, setLastResult] = useState(null); // {correct, correctAnswer, feedback}
  const [results, setResults] = useState([]); // per-question correct/incorrect for scoring
  const [mastery, setMastery] = useState(microUnit.default_mastery_pct);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data: threshold } = await supabase
          .from('student_mastery_thresholds')
          .select('mastery_pct')
          .eq('student_id', studentId)
          .eq('micro_unit_id', microUnit.id)
          .single();
        if (threshold) setMastery(threshold.mastery_pct);

        const built = buildPracticeQuestions(microUnit.question_template, QUESTION_COUNT);
        if (built.length === 0) {
          setError('This unit has no questions set up yet.');
          setStage('error');
          return;
        }
        setQuestions(built);
        setStage('question');
      } catch (err) {
        setError('Failed to load practice questions.');
        setStage('error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmitAnswer() {
    if (!answerInput.trim()) return;
    setChecking(true);
    try {
      const res = await fetch('/api/check-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: questions[questionIndex], studentAnswer: answerInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check failed');
      setLastResult(data);
      setResults((prev) => [...prev, { errorType: data.correct ? null : 'incorrect_answer', correct: data.correct }]);
      setStage('feedback');
    } catch (err) {
      setError(err.message || 'Failed to check answer');
      setStage('error');
    }
    setChecking(false);
  }

  async function handleNext() {
    setAnswerInput('');
    setLastResult(null);
    if (questionIndex + 1 >= questions.length) {
      await finishAttempt();
    } else {
      setQuestionIndex((i) => i + 1);
      setStage('question');
    }
  }

  async function finishAttempt() {
    const correctCount = results.filter((r) => r.correct).length + (lastResult?.correct ? 0 : 0); // results already includes the final answer via handleSubmitAnswer
    const scorePct = Math.round((results.filter((r) => r.correct).length / questions.length) * 100);
    const passedThreshold = scorePct >= mastery;

    try {
      await supabase.from('attempts').insert({
        student_id: studentId,
        micro_unit_id: microUnit.id,
        submitted_via: 'web',
        raw_answers: { questions, results },
        ai_marking_result: { perQuestionResults: results },
        score_pct: scorePct,
        passed_threshold: passedThreshold,
        attempt_number: 1,
      });
    } catch (err) {
      // Non-fatal - still show the result even if the save fails.
      console.error('Failed to save attempt:', err);
    }

    setStage('result');
    setLastResult({ ...lastResult, finalScore: scorePct, finalPassed: passedThreshold });
  }

  if (stage === 'loading') {
    return <div className={styles.container}>Loading practice…</div>;
  }

  if (stage === 'error') {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
        <button onClick={() => router.push('/')}>Back</button>
      </div>
    );
  }

  if (stage === 'question') {
    const q = questions[questionIndex];
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1>Question {questionIndex + 1} of {questions.length}</h1>
            <div className={styles.progress}>
              <div className={styles.progressBar} style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} />
            </div>
          </div>
          <div className={styles.question}>
            <h2>{q.prompt}</h2>
          </div>
          <div className={styles.answer}>
            <input
              type="number"
              value={answerInput}
              onChange={(e) => setAnswerInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !checking) handleSubmitAnswer(); }}
              disabled={checking}
              placeholder="Enter your answer"
              className={styles.input}
              autoFocus
            />
          </div>
          <button onClick={handleSubmitAnswer} disabled={checking || !answerInput.trim()} className={styles.submitBtn}>
            {checking ? 'Checking…' : 'Check Answer'}
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'feedback') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 12 }}>
            {lastResult.correct ? '✓' : '✗'}
          </div>
          <h2 style={{ textAlign: 'center', color: lastResult.correct ? '#1a7a3e' : '#b03a2e' }}>
            {lastResult.correct ? 'Correct!' : 'Not quite'}
          </h2>
          {!lastResult.correct && (
            <>
              <p style={{ textAlign: 'center' }}>The correct answer was <strong>{lastResult.correctAnswer}</strong>.</p>
              {lastResult.feedback && (
                <div style={{ background: '#fff8ee', border: '1px solid #ddd4c2', borderRadius: 8, padding: 16, marginTop: 12 }}>
                  {lastResult.feedback}
                </div>
              )}
            </>
          )}
          <button onClick={handleNext} className={styles.submitBtn} style={{ marginTop: 16 }}>
            {questionIndex + 1 >= questions.length ? 'See Results' : 'Next Question'}
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'result') {
    const score = lastResult?.finalScore ?? 0;
    const passed = lastResult?.finalPassed ?? false;
    return (
      <div className={styles.container}>
        <div className={styles.resultCard}>
          <h1>Practice Complete</h1>
          <div className={`${styles.scoreCircle} ${passed ? styles.passed : styles.failed}`}>
            <div className={styles.score}>{score}%</div>
            <div className={styles.status}>{passed ? '✓ Passed' : '✗ Not Yet'}</div>
          </div>
          <p className={styles.threshold}>Mastery threshold: {mastery}%</p>
          {passed ? (
            <p className={styles.message}>Great job! You've mastered this concept.</p>
          ) : (
            <p className={styles.message}>Keep practicing! You need {mastery - score}% more to pass.</p>
          )}
          <div className={styles.actions}>
            {!passed && (
              <button onClick={() => window.location.reload()} className={styles.retryBtn}>Try Again</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
