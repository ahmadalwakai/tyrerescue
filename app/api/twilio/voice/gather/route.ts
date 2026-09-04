import 'server-only';
import {
  extractConfirmation,
  extractIntent,
  extractLocation,
  extractProblem,
  extractVehicleReg,
  buildConfirmationText,
} from '@/lib/ai-receptionist/groq';
import {
  completeCallSession,
  getCallSession,
  updateCallSession,
} from '@/lib/ai-receptionist/session';
import { twimlGather, twimlSay, twimlXmlResponse } from '@/lib/ai-receptionist/twiml';
import { sendUrgentBookingTopicPush } from '@/lib/notifications/urgent-booking-push';
import type { CollectedData, TranscriptEntry } from '@/lib/ai-receptionist/types';
import { CONVERSATION_STEPS } from '@/lib/ai-receptionist/types';

export const runtime = 'nodejs';

const MAX_RETRIES = 2;

function baseUrl(): string {
  return (process.env.TWILIO_WEBHOOK_URL ?? 'https://www.tyrerescue.uk').replace(/\/$/, '');
}

function gatherUrl(callSid: string, step: number): string {
  return `${baseUrl()}/api/twilio/voice/gather?step=${step}&callSid=${encodeURIComponent(callSid)}`;
}

function appendTranscript(
  transcript: TranscriptEntry[],
  role: 'ai' | 'customer',
  text: string,
  step: number,
): TranscriptEntry[] {
  return [...transcript, { role, text, step, ts: new Date().toISOString() }];
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const params = new URLSearchParams(rawBody);

  const callSid = params.get('callSid') ?? params.get('CallSid') ?? '';
  const speech = (params.get('SpeechResult') ?? '').trim();
  const stepParam = Number(params.get('step') ?? '0');

  if (!callSid) return new Response('Bad Request', { status: 400 });

  const session = await getCallSession(callSid);
  if (!session) {
    return twimlXmlResponse(
      twimlSay("I'm sorry, something went wrong. Please call us back and we'll be happy to help."),
    );
  }

  const collected = (session.collectedData ?? {}) as CollectedData;
  let transcript = (session.transcript ?? []) as TranscriptEntry[];

  // No speech detected — retry or bail
  if (!speech) {
    const retries = session.retryCount + 1;
    if (retries > MAX_RETRIES) {
      await updateCallSession(callSid, { status: 'no_answer' });
      return twimlXmlResponse(
        twimlSay("I'm sorry I couldn't hear you clearly. Please call back and we'll get you sorted. Goodbye."),
      );
    }
    await updateCallSession(callSid, { retryCount: retries });
    return twimlXmlResponse(buildStepTwiml(stepParam, callSid, collected, true));
  }

  transcript = appendTranscript(transcript, 'customer', speech, stepParam);

  let nextStep = stepParam;
  let nextTwiml: string;

  switch (stepParam) {
    case CONVERSATION_STEPS.GREETING: {
      const { intent } = await extractIntent(speech);
      const updatedData: CollectedData = { ...collected, intent };

      if (intent === 'enquiry') {
        const aiText =
          "For general enquiries, our team would love to help you. I'll arrange a callback. "
          + "What is your vehicle registration number, or you can say skip if you don't have it.";
        transcript = appendTranscript(transcript, 'ai', aiText, CONVERSATION_STEPS.COLLECT_REG);
        await updateCallSession(callSid, {
          step: CONVERSATION_STEPS.COLLECT_REG,
          collectedData: updatedData,
          transcript,
          retryCount: 0,
        });
        return twimlXmlResponse(
          twimlGather({
            text: aiText,
            actionUrl: gatherUrl(callSid, CONVERSATION_STEPS.COLLECT_REG),
            hints: 'registration, skip, don\'t have it',
          }),
        );
      }

      const aiText = "Got it. What is your vehicle registration number? For example, A B 1 2 C D E.";
      transcript = appendTranscript(transcript, 'ai', aiText, CONVERSATION_STEPS.COLLECT_REG);
      await updateCallSession(callSid, {
        step: CONVERSATION_STEPS.COLLECT_REG,
        collectedData: updatedData,
        transcript,
        retryCount: 0,
      });
      return twimlXmlResponse(
        twimlGather({
          text: aiText,
          actionUrl: gatherUrl(callSid, CONVERSATION_STEPS.COLLECT_REG),
          hints: 'registration number, alpha, bravo, charlie, delta, echo, foxtrot, skip',
        }),
      );
    }

    case CONVERSATION_STEPS.COLLECT_REG: {
      const skip = /skip|don't|don't|no reg|don't know/i.test(speech);
      let vehicleReg: string | undefined;

      if (!skip) {
        const result = await extractVehicleReg(speech);
        vehicleReg = result.value ?? undefined;
      }

      const updatedData: CollectedData = { ...collected, vehicleReg };
      const regDisplay = vehicleReg ? vehicleReg.split('').join(' ') : 'not provided';
      const aiText = vehicleReg
        ? `Thank you. I have registration ${regDisplay}. What is your postcode or current location?`
        : "No problem. What is your postcode or current location?";

      transcript = appendTranscript(transcript, 'ai', aiText, CONVERSATION_STEPS.COLLECT_LOCATION);
      await updateCallSession(callSid, {
        step: CONVERSATION_STEPS.COLLECT_LOCATION,
        collectedData: updatedData,
        transcript,
        retryCount: 0,
      });
      return twimlXmlResponse(
        twimlGather({
          text: aiText,
          actionUrl: gatherUrl(callSid, CONVERSATION_STEPS.COLLECT_LOCATION),
          hints: 'postcode, street, road, Glasgow, Edinburgh, Aberdeen, Dundee, Perth',
        }),
      );
    }

    case CONVERSATION_STEPS.COLLECT_LOCATION: {
      const result = await extractLocation(speech);
      const location = result.value ?? speech.slice(0, 80);
      const updatedData: CollectedData = { ...collected, location };

      const aiText = "Got it. And can you briefly describe the tyre issue? For example, flat tyre, puncture, or blowout?";
      transcript = appendTranscript(transcript, 'ai', aiText, CONVERSATION_STEPS.COLLECT_PROBLEM);
      await updateCallSession(callSid, {
        step: CONVERSATION_STEPS.COLLECT_PROBLEM,
        collectedData: updatedData,
        transcript,
        retryCount: 0,
      });
      return twimlXmlResponse(
        twimlGather({
          text: aiText,
          actionUrl: gatherUrl(callSid, CONVERSATION_STEPS.COLLECT_PROBLEM),
          hints: 'flat tyre, puncture, blowout, slow puncture, run flat, bead leak, sidewall damage',
        }),
      );
    }

    case CONVERSATION_STEPS.COLLECT_PROBLEM: {
      const result = await extractProblem(speech);
      const problem = result.value ?? speech.slice(0, 120);
      const updatedData: CollectedData = { ...collected, problem };

      const confirmText = buildConfirmationText(updatedData, session.callerNumber);
      transcript = appendTranscript(transcript, 'ai', confirmText, CONVERSATION_STEPS.CONFIRM);
      await updateCallSession(callSid, {
        step: CONVERSATION_STEPS.CONFIRM,
        collectedData: updatedData,
        transcript,
        retryCount: 0,
      });
      return twimlXmlResponse(
        twimlGather({
          text: confirmText,
          actionUrl: gatherUrl(callSid, CONVERSATION_STEPS.CONFIRM),
          hints: 'yes, correct, that\'s right, no, wrong, change',
          timeout: 10,
        }),
      );
    }

    case CONVERSATION_STEPS.CONFIRM: {
      const confirmed = await extractConfirmation(speech);

      if (!confirmed) {
        const aiText =
          "No problem. Let me start again. What is your vehicle registration number?";
        transcript = appendTranscript(transcript, 'ai', aiText, CONVERSATION_STEPS.COLLECT_REG);
        await updateCallSession(callSid, {
          step: CONVERSATION_STEPS.COLLECT_REG,
          collectedData: {},
          transcript,
          retryCount: 0,
        });
        return twimlXmlResponse(
          twimlGather({
            text: aiText,
            actionUrl: gatherUrl(callSid, CONVERSATION_STEPS.COLLECT_REG),
            hints: 'registration number',
          }),
        );
      }

      // All confirmed — create callMeBack record and notify operator
      const callMeBackId = await completeCallSession(
        callSid,
        collected,
        session.callerNumber,
      );

      if (callMeBackId) {
        void sendUrgentBookingTopicPush({
          bookingId: callMeBackId,
          customerPhone: session.callerNumber,
          createdAt: new Date().toISOString(),
          title: '📞 AI Receptionist — Callback Needed',
          body: `${collected.vehicleReg ?? 'Unknown reg'} · ${collected.location ?? 'Location unknown'} · ${collected.problem ?? 'Tyre issue'}`,
        });
      }

      const goodbye =
        "Perfect. An engineer will call you back on this number within 5 minutes. "
        + "Thank you for choosing Tyre Rescue. Stay safe and we'll be with you shortly. Goodbye.";

      transcript = appendTranscript(transcript, 'ai', goodbye, CONVERSATION_STEPS.COMPLETE);
      await updateCallSession(callSid, { status: 'completed', transcript });

      return twimlXmlResponse(twimlSay(goodbye));
    }

    default:
      return twimlXmlResponse(
        twimlSay("I'm sorry, something went wrong. Please call us back and we'll be happy to help."),
      );
  }

  // TypeScript satisfaction — all cases return above
  return twimlXmlResponse(twimlSay('Goodbye.'));
}

function buildStepTwiml(
  step: number,
  callSid: string,
  collected: CollectedData,
  isRetry: boolean,
): string {
  const prefix = isRetry ? "I'm sorry, I didn't quite catch that. " : '';
  const actionUrl = gatherUrl(callSid, step);

  switch (step) {
    case CONVERSATION_STEPS.GREETING:
      return twimlGather({
        text: prefix + "Are you calling about an emergency flat tyre, or do you have a general enquiry?",
        actionUrl,
        hints: 'emergency, flat tyre, enquiry, yes, no',
      });
    case CONVERSATION_STEPS.COLLECT_REG:
      return twimlGather({
        text: prefix + "What is your vehicle registration number? Please say each letter and number clearly.",
        actionUrl,
        hints: 'registration, alpha, bravo, skip',
      });
    case CONVERSATION_STEPS.COLLECT_LOCATION:
      return twimlGather({
        text: prefix + "What is your postcode or location?",
        actionUrl,
        hints: 'postcode, street, road',
      });
    case CONVERSATION_STEPS.COLLECT_PROBLEM:
      return twimlGather({
        text: prefix + "Can you describe the tyre problem? For example, flat tyre or puncture?",
        actionUrl,
        hints: 'flat tyre, puncture, blowout',
      });
    case CONVERSATION_STEPS.CONFIRM:
      return twimlGather({
        text: prefix + buildConfirmationText(collected, ''),
        actionUrl,
        hints: 'yes, correct, no, wrong',
      });
    default:
      return twimlSay("I'm sorry, please call us back and we'll be happy to help.");
  }
}
