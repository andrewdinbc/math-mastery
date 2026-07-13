import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request) {
  try {
    const { studentId, microUnitId, rawAnswers } = await request.json();

    if (!studentId || !microUnitId || !rawAnswers) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400 }
      );
    }

    const supabase = createServerComponentClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401 }
      );
    }

    // Fetch micro_unit to get question_template and default_mastery_pct
    const { data: microUnit, error: muError } = await supabase
      .from('mastery_micro_units')
      .select('id, question_template, default_mastery_pct')
      .eq('id', microUnitId)
      .single();

    if (muError || !microUnit) {
      return new Response(
        JSON.stringify({ error: 'Micro-unit not found' }),
        { status: 404 }
      );
    }

    // Fetch or determine student's mastery threshold
    const { data: thresholdRow } = await supabase
      .from('mastery_student_mastery_thresholds')
      .select('mastery_pct')
      .eq('student_id', studentId)
      .eq('micro_unit_id', microUnitId)
      .single();

    const masteryThreshold =
      thresholdRow?.mastery_pct ?? microUnit.default_mastery_pct ?? 80;

    // First AI call: mark the attempt
    const markingPrompt = `You are an expert math teacher marking student work. 
    
The question template/structure is:
${JSON.stringify(microUnit.question_template, null, 2)}

The student's raw answers are:
${JSON.stringify(rawAnswers, null, 2)}

Based on the question_template (which contains correct answers and the mathematical problem structure), evaluate each answer.

For any WRONG answer, work through the correct solution as a numbered sequence of steps, then
identify which specific step number is where the student's answer would have diverged from
correct - not just a category of mistake, but "this happened at step 2 of solving this problem."
Infer the likely divergence point from the type of wrong answer given (e.g. if the sign is flipped
but magnitude is right, the error is almost certainly at the step where a negative sign gets
applied; if the answer is off by a specific factor, it's likely a step involving that operation).

Return a JSON object (and ONLY valid JSON, no other text) with this structure:
{
  "perQuestionResults": [
    {
      "questionIndex": 0,
      "correct": true,
      "errorType": null,
      "errorStep": null
    },
    {
      "questionIndex": 1,
      "correct": false,
      "errorType": "sign_error",
      "errorStep": {
        "stepNumber": 2,
        "correctSteps": ["Step 1: Distribute -3 across (x + 4) to get -3x - 12", "Step 2: Combine with the remaining 2x term: -3x - 12 + 2x", "Step 3: Combine like terms: -x - 12"],
        "whatWentWrong": "At step 2, when combining -3x and 2x, the negative sign was dropped, giving x - 12 instead of -x - 12"
      }
    }
  ],
  "scorePct": 50
}

For errorType, use specific, actionable categories like:
- "sign_error" (wrong sign in answer)
- "arithmetic_error" (calculation mistake)
- "order_of_operations" (PEMDAS/BODMAS violation)
- "conceptual_misunderstanding" (wrong method/formula applied)
- "incomplete_work" (didn't finish)
- "notation_error" (correct answer, wrong format)
- null (for correct answers)

scorePct should be the percentage of questions answered correctly.`;

    const markingResponse = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: markingPrompt,
        },
      ],
    });

    let markingResult;
    try {
      const markingText =
        markingResponse.content[0].type === 'text'
          ? markingResponse.content[0].text
          : '';
      markingResult = JSON.parse(markingText);
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: 'Failed to parse marking result' }),
        { status: 500 }
      );
    }

    const scorePct = markingResult.scorePct ?? 0;
    const passed = scorePct >= masteryThreshold;

    // Get attempt number for this student/micro_unit
    const { data: lastAttempt } = await supabase
      .from('mastery_attempts')
      .select('attempt_number')
      .eq('student_id', studentId)
      .eq('micro_unit_id', microUnitId)
      .order('attempt_number', { ascending: false })
      .limit(1);

    const attemptNumber = (lastAttempt?.[0]?.attempt_number ?? 0) + 1;

    // Insert attempt record
    const { data: insertedAttempt, error: attemptError } = await supabase
      .from('mastery_attempts')
      .insert({
        student_id: studentId,
        micro_unit_id: microUnitId,
        submitted_via: 'online',
        raw_answers: rawAnswers,
        ai_marking_result: markingResult,
        score_pct: scorePct,
        passed_threshold: passed,
        attempt_number: attemptNumber,
      })
      .select('id')
      .single();

    if (attemptError || !insertedAttempt) {
      return new Response(
        JSON.stringify({ error: 'Failed to insert attempt record' }),
        { status: 500 }
      );
    }

    let remediationData = null;

    // If failed, generate remediation session
    if (!passed) {
      // Find most common error type
      const errorCounts = {};
      markingResult.perQuestionResults.forEach((result) => {
        if (result.errorType && !result.correct) {
          errorCounts[result.errorType] =
            (errorCounts[result.errorType] ?? 0) + 1;
        }
      });

      const mostCommonError =
        Object.entries(errorCounts).length > 0
          ? Object.entries(errorCounts).sort(([, a], [, b]) => b - a)[0][0]
          : 'general_misunderstanding';

      // Second AI call: generate remediation content
      const remediationPrompt = `You are a compassionate math teacher creating a targeted mini-lesson to help a struggling student.

The student just failed a math practice set on this topic:
${JSON.stringify(microUnit.question_template, null, 2)}

The most common error pattern in their work is: "${mostCommonError}"

Create a "chalkboard-style" remediation lesson that:
1. Gently explains the specific mistake in plain language (as if you're writing on a whiteboard)
2. Provides ONE worked example showing the correct approach
3. Explains WHY the student's approach was wrong

Then generate 3 follow-up practice questions in the EXACT same question_template format, but specifically designed to test whether the student has overcome this error.

Return a JSON object (and ONLY valid JSON, no other text):
{
  "errorPattern": "sign_error",
  "explanation": "When we multiply a negative by a positive, we always get a negative result...",
  "workedExample": "For example, -3 × 5 = -15 because...",
  "followUpQuestions": [
    { ...question 1 in question_template format... },
    { ...question 2 in question_template format... },
    { ...question 3 in question_template format... }
  ]
}`;

      const remediationResponse = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: remediationPrompt,
          },
        ],
      });

      let remediationContent;
      try {
        const remediationText =
          remediationResponse.content[0].type === 'text'
            ? remediationResponse.content[0].text
            : '';
        remediationContent = JSON.parse(remediationText);
      } catch (parseError) {
        // If remediation generation fails, still return the marking result
        remediationData = null;
      }

      if (remediationContent) {
        // Insert remediation session
        const followUpQuestionIds =
          remediationContent.followUpQuestions?.map((_, idx) => idx) ?? [];

        const { data: remediationSession, error: remError } = await supabase
          .from('mastery_remediation_sessions')
          .insert({
            attempt_id: insertedAttempt.id,
            error_pattern: mostCommonError,
            remediation_content: remediationContent,
            follow_up_question_ids: followUpQuestionIds,
            resolved: false,
          })
          .select('id')
          .single();

        if (!remError && remediationSession) {
          remediationData = {
            sessionId: remediationSession.id,
            errorPattern: mostCommonError,
            explanation: remediationContent.explanation,
            workedExample: remediationContent.workedExample,
            followUpQuestions: remediationContent.followUpQuestions,
          };

          // Video bank: reuse before regenerate, escalate on repeat.
          // Per Aj: most errors cluster into a small number of recurring
          // patterns, so the FIRST time a student hits sign_error_on_division
          // (say) in this strand, check whether ANY student has already
          // triggered a generic video for that exact (error_pattern, strand)
          // pair - if so, reuse it (no new render, no new cost). Only
          // generate fresh if the bank genuinely has nothing yet, and mark
          // that new one as reusable for the next student who hits the same
          // pattern. If THIS student has already seen the generic video for
          // this error_pattern before and is making the same mistake again,
          // the generic explanation clearly isn't landing - escalate to a
          // question-specific video instead of showing them the same thing
          // again, tied to their exact current question (not reused later,
          // since it's tailored to this one).
          const { data: priorSessionsForPattern } = await supabase
            .from('mastery_remediation_sessions')
            .select('id, attempt_id, mastery_attempts!inner(student_id)')
            .eq('error_pattern', mostCommonError)
            .eq('mastery_attempts.student_id', studentId);

          const isRepeatForThisStudent = (priorSessionsForPattern?.length || 0) > 0;
          const specificity = isRepeatForThisStudent ? 'question_specific' : 'generic';

          let bankEntry = null;
          if (specificity === 'generic') {
            const { data: existingBankVideo } = await supabase
              .from('mastery_video_bank')
              .select('*')
              .eq('error_pattern', mostCommonError)
              .eq('strand', microUnit.strand || null)
              .eq('specificity', 'generic')
              .eq('video_status', 'ready')
              .limit(1)
              .maybeSingle();

            if (existingBankVideo) {
              bankEntry = existingBankVideo;
              await supabase.from('mastery_video_bank').update({ times_reused: (existingBankVideo.times_reused || 0) + 1 }).eq('id', existingBankVideo.id);
            }
          }

          if (!bankEntry) {
            // Nothing to reuse - register a new bank entry (generic, for
            // future reuse, or question_specific, tied to just this
            // session). video_status stays pending_generation until the
            // actual rendering pipeline (Manim prototype, still being
            // evaluated) produces a real video_url - this endpoint never
            // fakes a ready video.
            const { data: newBankEntry } = await supabase
              .from('mastery_video_bank')
              .insert({
                error_pattern: mostCommonError,
                strand: microUnit.strand || null,
                specificity,
                title: remediationContent.explanation?.slice(0, 80) || mostCommonError,
                source_remediation_session_id: remediationSession.id,
              })
              .select()
              .single();
            bankEntry = newBankEntry;
          }

          remediationData.videoBank = bankEntry
            ? { id: bankEntry.id, specificity: bankEntry.specificity, status: bankEntry.video_status, videoUrl: bankEntry.video_url, reused: bankEntry.times_reused > 0 }
            : null;

          if (bankEntry) {
            await supabase.from('mastery_remediation_sessions').update({ video_bank_id: bankEntry.id }).eq('id', remediationSession.id);
          }

          // Video-style tutorial built around the student's own exact
          // missed question, not a generic re-explanation - per Aj, styled
          // like a short instructional video (hook, step-by-step walkthrough,
          // the specific step that went wrong called out explicitly).
          const missedResult = markingResult.perQuestionResults.find(
            (r) => !r.correct && r.errorType === mostCommonError && r.errorStep
          );

          if (missedResult) {
            const missedQuestion = rawAnswers[missedResult.questionIndex];
            const tutorialPrompt = `Write a short (60-90 second) video-style tutorial script explaining this exact
math question a student got wrong, matching the tone of a quick "Learn How to" style
instructional short: direct, encouraging, one clear worked example, no fluff.

The exact question the student attempted: ${JSON.stringify(missedQuestion)}
The correct step-by-step solution: ${JSON.stringify(missedResult.errorStep.correctSteps)}
Exactly where their approach likely went wrong: ${missedResult.errorStep.whatWentWrong}

Respond with ONLY valid JSON, no markdown fences, no preamble:
{
  "title": "short punchy title, e.g. 'Distributing Negatives Made Easy'",
  "hook": "1 sentence to open - relatable, not preachy",
  "steps": [
    { "narration": "what to say for this step", "workShown": "the math notation for this step" }
  ],
  "commonMistakeCallout": "1-2 sentences calling out the exact mistake pattern, framed supportively",
  "practicePrompt": "one closing line encouraging them to try the follow-up questions"
}`;

            try {
              const tutorialResponse = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1200,
                messages: [{ role: 'user', content: tutorialPrompt }],
              });
              const tutorialText = tutorialResponse.content[0].type === 'text' ? tutorialResponse.content[0].text : '';
              const tutorialScript = JSON.parse(tutorialText.replace(/```json|```/g, '').trim());

              await supabase
                .from('mastery_remediation_sessions')
                .update({ remediation_content: { ...remediationContent, videoTutorial: tutorialScript } })
                .eq('id', remediationSession.id);

              remediationData.videoTutorial = tutorialScript;
              remediationData.errorStep = missedResult.errorStep;
            } catch {
              // Tutorial generation is additive - if it fails, the rest of
              // the remediation (explanation, worked example, follow-ups)
              // still returns successfully.
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        passed,
        scorePct,
        attemptId: insertedAttempt.id,
        attemptNumber,
        remediation: remediationData,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in mark-attempt:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 }
    );
  }
}

