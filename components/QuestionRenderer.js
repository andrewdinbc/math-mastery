'use client';

import { useState } from 'react';
import styles from './QuestionRenderer.module.css';

export default function QuestionRenderer({
  question,
  questionNumber,
  totalQuestions,
  onSubmit,
  loading,
}) {
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [answerText, setAnswerText] = useState('');

  const handleSubmit = () => {
    let answer;

    if (question.type === 'multiple_choice') {
      answer = selectedAnswer;
    } else if (question.type === 'short_answer') {
      answer = answerText.trim();
    } else {
      answer = answerText.trim();
    }

    if (answer) {
      onSubmit(answer);
      setSelectedAnswer('');
      setAnswerText('');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1>Question {questionNumber} of {totalQuestions}</h1>
          <div className={styles.progress}>
            <div
              className={styles.progressBar}
              style={{ width: `${(questionNumber / totalQuestions) * 100}%` }}
            />
          </div>
        </div>

        <div className={styles.question}>
          <h2>{question.text || question.question}</h2>

          {question.image && (
            <img
              src={question.image}
              alt="Question image"
              className={styles.questionImage}
            />
          )}
        </div>

        <div className={styles.answer}>
          {question.type === 'multiple_choice' && question.options && (
            <div className={styles.options}>
              {question.options.map((option, idx) => (
                <label key={idx} className={styles.option}>
                  <input
                    type="radio"
                    name="answer"
                    value={option}
                    checked={selectedAnswer === option}
                    onChange={(e) => setSelectedAnswer(e.target.value)}
                    disabled={loading}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          )}

          {(question.type === 'short_answer' || question.type === 'numeric') && (
            <input
              type={question.type === 'numeric' ? 'number' : 'text'}
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !loading) handleSubmit();
              }}
              disabled={loading}
              placeholder="Enter your answer"
              className={styles.input}
            />
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || !selectedAnswer && !answerText}
          className={styles.submitBtn}
        >
          {loading ? 'Processing...' : 'Next'}
        </button>
      </div>
    </div>
  );
}
