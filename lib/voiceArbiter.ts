'use client';

type SpeechListener = (isSpeaking: boolean) => void;

class VoiceArbiter {
  private isAgoraVoiceActive = false;
  private isSynthesizing = false;
  private lastSpokenText = '';
  private lastSpokenTime = 0;
  private currentUtteranceId = 0;
  private watchdogInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<SpeechListener> = new Set();
  private hasSpokenInitialGreeting = false;

  /**
   * Set whether Agora SD-RTN cloud audio bridge is active.
   * When true, Agora remote audio is primary and browser SpeechSynthesis is suppressed.
   */
  public setAgoraVoiceActive(active: boolean) {
    this.isAgoraVoiceActive = active;
    if (active) {
      // Immediately cancel any pending or active browser speech synthesis
      this.stop();
    }
  }

  public getIsAgoraVoiceActive(): boolean {
    return this.isAgoraVoiceActive;
  }

  public getIsSpeaking(): boolean {
    return this.isSynthesizing;
  }

  public addListener(listener: SpeechListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(speaking: boolean) {
    this.isSynthesizing = speaking;
    this.listeners.forEach((fn) => {
      try {
        fn(speaking);
      } catch {}
    });
  }

  /**
   * Immediately stops all active and queued browser speech.
   */
  public stop() {
    if (typeof window === 'undefined') return;
    this.currentUtteranceId++;
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    this.notify(false);
  }

  /**
   * Speaks the given text using browser SpeechSynthesis IF AND ONLY IF:
   * 1. Agora cloud RTC voice is not active (single voice guarantee).
   * 2. It is not an identical repeat within 3.5 seconds.
   * 3. Any previous speech is immediately terminated before the new speech begins.
   */
  public speak(
    text: string,
    options?: {
      onStart?: () => void;
      onEnd?: () => void;
      force?: boolean;
      isGreeting?: boolean;
    },
  ): boolean {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      options?.onEnd?.();
      return false;
    }

    const clean = text.replace(/[*_#`~[\]()]/g, '').trim();
    if (!clean) {
      options?.onEnd?.();
      return false;
    }

    // 1. Single-voice exclusivity: if Agora cloud agent is active, never play browser TTS
    if (this.isAgoraVoiceActive && !options?.force) {
      console.log('[VoiceArbiter] Browser speech suppressed: Agora Cloud Agent is primary audio source.');
      options?.onEnd?.();
      return false;
    }

    // 2. Greeting rule: greeting must only speak once across the lifetime of the session
    if (options?.isGreeting) {
      if (this.hasSpokenInitialGreeting) {
        options?.onEnd?.();
        return false;
      }
      this.hasSpokenInitialGreeting = true;
    }

    // 3. Deduplication rule: do not repeat exact same utterance within 3500ms
    const now = Date.now();
    if (
      !options?.force &&
      this.lastSpokenText.toLowerCase() === clean.toLowerCase() &&
      now - this.lastSpokenTime < 3500
    ) {
      options?.onEnd?.();
      return false;
    }
    this.lastSpokenText = clean;
    this.lastSpokenTime = now;

    // 4. Cancel any previous speech immediately
    this.stop();

    const utteranceId = ++this.currentUtteranceId;
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    let hasEnded = false;
    const finish = () => {
      if (hasEnded || this.currentUtteranceId !== utteranceId) return;
      hasEnded = true;
      if (this.watchdogInterval) {
        clearInterval(this.watchdogInterval);
        this.watchdogInterval = null;
      }
      this.notify(false);
      options?.onEnd?.();
    };

    utterance.onstart = () => {
      if (this.currentUtteranceId !== utteranceId) return;
      this.notify(true);
      options?.onStart?.();

      if (this.watchdogInterval) clearInterval(this.watchdogInterval);
      this.watchdogInterval = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          finish();
        } else if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 4000);
    };

    utterance.onend = finish;
    utterance.onerror = (e) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('[VoiceArbiter] Speech synthesis error:', e.error);
      }
      finish();
    };

    const chooseVoiceAndSpeak = () => {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        const voices = window.speechSynthesis.getVoices();
        const preferred =
          voices.find(
            (v) =>
              v.lang.startsWith('en') &&
              (v.name.includes('Natural') ||
                v.name.includes('Google') ||
                v.name.includes('Samantha') ||
                v.name.includes('Daniel') ||
                v.name.includes('Alex') ||
                v.name.includes('Karen')),
          ) || voices.find((v) => v.lang.startsWith('en'));

        if (preferred) {
          utterance.voice = preferred;
        }

        window.speechSynthesis.speak(utterance);

        // Fallback timer if onstart never fires
        setTimeout(() => {
          if (
            this.currentUtteranceId === utteranceId &&
            !hasEnded &&
            !window.speechSynthesis.speaking
          ) {
            finish();
          }
        }, 1200);
      } catch (err) {
        console.warn('[VoiceArbiter] Speak execution error:', err);
        finish();
      }
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      chooseVoiceAndSpeak();
    } else {
      let handled = false;
      const onVoices = () => {
        if (handled) return;
        handled = true;
        window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
        chooseVoiceAndSpeak();
      };
      window.speechSynthesis.addEventListener('voiceschanged', onVoices);
      setTimeout(() => {
        if (!handled) {
          handled = true;
          window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
          chooseVoiceAndSpeak();
        }
      }, 300);
    }

    return true;
  }
}

export const voiceArbiter = new VoiceArbiter();
