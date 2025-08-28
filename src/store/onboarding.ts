import { create, type StateCreator } from "zustand";

export type OnboardingStep = 0 | 1 | 2 | 3 | 4;

type OnboardingState = {
  step: OnboardingStep;
  completed: boolean;
  start: () => void;
  next: () => void;
  back: () => void;
  reset: () => void;
};

const creator: StateCreator<OnboardingState> = (set, get) => ({
  step: 0,
  completed: false,
  start: () => set({ step: 0, completed: false }),
  next: () => {
    const cur = get().step;
    if (cur < 4) set({ step: (cur + 1) as OnboardingStep });
    else set({ completed: true });
  },
  back: () => set((s) => ({ step: (Math.max(0, s.step - 1) as OnboardingStep) })),
  reset: () => set({ step: 0, completed: false }),
});

export const useOnboarding = create<OnboardingState>(creator);
