'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import QuestionRenderer from './QuestionRenderer';
import styles from './PracticeFlow.module.css';

export default function PracticeFlow({ microUnit, studentId }) {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [stage, setStage] = useState('loading'); // loading, question, result, remediation
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [score, setScore] = useState(null);
  const [passed, setPassed] = useState(null);
  const [mastery, setMastery] = useState(microUnit.default_mastery_pct);
  const [attemptId, setAttemptId] = useState(null);
  const [remediationData, setRemediationData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    initializePractice();
  }, []);

  const initializePractice = async () => {
    try {
      // Get custom mastery threshold if exists
      const { data: threshold } = await supabase
        .from('student_mastery_thresholds')
        .select('mastery_pct')
        .eq('student_id', studentId)
        .eq('micro_unit_id', microUnit.id)
        .single();

      if (threshold) {
        setMastery(threshold.mastery_pct);
      }

      loadNextQuestion();
    } catch (err) {
      setError('Failed to initialize practice');
      setStage('error');
    }
  };

  const loadNextQuestion = () => {
    if (questionIndex >= microUnit.question_count) {
      submitAnswers();
      return;
    }

    const questions = microUnit.question_template;
    let question = questions[questionIndex % questions.length];

    // Randomize if flag set
    if (microUnit.randomizable && question.options) {
      const shuffled = [...question.options].sort(() => Math.random() - 0.5);
      question = { ...question, options: shuffled };
    }

    setCurrentQuestion(question);
    setStage('question');
  };

  const handleAnswerSubmit = (answer) => {
    const newAnswers = [...answers, { questionIndex, answer }];
    setAnswers(newAnswers);
    setQuestionIndex(questionIndex + 1);

    if (questionIndex + 1 >= microUnit.question_count) {
      submitAnswers(newAnswers);
    } else {
      loadNextQuestion();
    }
  };

  const submitAnswers = async (finalAnswers = answers) => {
    setLoading(true);
    setStage('processing');

    try {
      // Create attempt record
      const { data: attempt, error: attemptError } = await supabase
        .from('attempts')
        .insert([
          {
            student_id: studentId,
            micro_unit_id: microUnit.id,
            submitted_via: 'web',
            raw_answers: finalAnswers,
            attempt_number: 1, // TODO: increment by actual attempt count
          },
        ])
        .select()
        .single();

      if (attemptError) throw attemptError;

      setAttemptId(attempt.id);

      // Call AI marking API
      const response = await fetch('/api/mark-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionTemplate: microUnit.question_template,
          answers: finalAnswers,
          attemptId: attempt.id,
        }),
      });

      if (!response.ok) throw new Error('Failed to mark answers');

      const marking = await response.json();
      const scorePct = Math.round((marking.correct / microUnit.question_count) * 100);
      const passedThreshold = scorePct >= mastery;

      // Update attempt
      await supabase
        .from('attempts')
        .update({
          ai_marking_result: marking,
          score_pct: scorePct,
          passed_threshold: passedThreshold,
        })
        .eq('id', attempt.id);

      setScore(scorePct);
      setPassed(passedThreshold);

      // If failed, get remediation
      if (!passedThreshold && marking.errors.length > 0) {
        await generateRemediation(attempt.id, marking.errors[0]);
      } else {
        setStage('result');
      }
    } catch (err) {
      setError(err.message || 'Failed to submit answers');
      setStage('error');
    } finally {
      setLoading(false);
    }
  };

  const generateRemediation = async (attemptId, errorPattern) => {
    try {
      const response = await fetch('/api/generate-remediation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorPattern,
          questionTemplate: microUnit.question_template,
          attemptId,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate remediation');

      const remediation = await response.json();
      setRemediationData(remediation);
      setStage('remediation');
    } catch (err) {
      setError('Failed to generate remediation');
      setStage('result');
    }
  };

  const handleRetry = () => {
    setQuestionIndex(0);
    setAnswers([]);
    setScore(null);
    setPassed(null);
    setRemediationData(null);
    setStage('loading');
    initializePractice();
  };

  if (stage === 'loading' || stage === 'processing') {
    return <div className={styles.container}>{loading ? 'Processing...' : 'Loading...'}</div>;
  }

  if (stage === 'error') {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
        <button onClick={() => router.push('/dashboard')}>Back to Dashboard</button>
      </div>
    );
  }

  if (stage === 'question') {
    return (
      <QuestionRenderer
        question={currentQuestion}
        questionNumber={questionIndex + 1}
        totalQuestions={microUnit.question_count}
        onSubmit={handleAnswerSubmit}
        loading={loading}
      />
    );
  }

  if (stage === 'result') {
    return (
      <div className={styles.container}>
        <div className={styles.resultCard}>
          <h1>Practice Complete</h1>

          <div className={`${styles.scoreCircle} ${passed ? styles.passed : styles.failed}`}>
            <div className={styles.score}>{score}%</div>
            <div className={styles.status}>
              {passed ? '✓ Passed' : '✗ Not Yet'}
            </div>
          </div>

          <p className={styles.threshold}>
            Mastery threshold: {mastery}%
          </p>

          {passed ? (
            <p className={styles.message}>Great job! You've mastered this concept.</p>
          ) : (
            <p className={styles.message}>
              Keep practicing! You need {mastery - score}% more to pass.
            </p>
          )}

          <div className={styles.actions}>
            {!passed && (
              <button onClick={handleRetry} className={styles.retryBtn}>
                Try Again
              </button>
            )}
            <button
              onClick={() => router.push('/dashboard')}
              className={styles.backBtn}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'remediation') {
    return (
      <div className={styles.container}>
        <div className={styles.remediationCard}>
          <h1>Let's Review This Concept</h1>
          <div
            className={styles.remediationContent}
            dangerouslySetInnerHTML={{
              __html: remediationData.htmlContent || remediationData.content || '',
            }}
          />
          <button onClick={handleRetry} className={styles.retryBtn}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return null;
}
