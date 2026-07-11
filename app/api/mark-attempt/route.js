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

Return a JSON object (and ONLY valid JSON, no other text) with this structure:
{
  "perQuestionResults": [
    {
      "questionIndex": 0,
      "correct": true,
      "errorType": null
    },
    {
      "questionIndex": 1,
      "correct": false,
      "errorType": "sign_error"
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