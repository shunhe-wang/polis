"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StepProgress } from "@/components/onboarding/step-progress";
import { IssueRater } from "@/components/onboarding/issue-rater";
import { PolicySignalSelector } from "@/components/onboarding/policy-signal-selector";
import { FreeTextInput } from "@/components/onboarding/free-text-input";
import { IdentitySelector } from "@/components/onboarding/identity-selector";
import {
  type Issue,
  type PolicySignal,
  type PoliticalIdentity,
  type ValuesProfile,
  createEmptyValuesProfile,
  hydrateValuesProfile,
} from "@/lib/types";
import {
  safeLocalStorageGet,
  safeLocalStorageSet,
  safeSessionStorageGet,
  safeSessionStorageSet,
} from "@/lib/browser-storage";
import { saveValuesProfile, syncFromSupabase } from "@/lib/persistence";

const STEP_LABELS = [
  "Rate Issues",
  "Policy Leanings",
  "Your Priorities",
  "Identity",
];
const TOTAL_STEPS = STEP_LABELS.length;
const ONBOARDING_STEP_KEY = "onboardingStep";

function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.min(TOTAL_STEPS - 1, Math.max(0, Math.floor(step)));
}

function saveBrowserDraft(key: string, value: string): boolean {
  const savedInSession = safeSessionStorageSet(key, value);
  const savedInLocal = safeLocalStorageSet(key, value);
  return savedInSession || savedInLocal;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ValuesProfile>(
    createEmptyValuesProfile
  );

  useEffect(() => {
    async function hydrateDraft() {
      await syncFromSupabase();

      const params = new URLSearchParams(window.location.search);
      const storedProfile =
        safeSessionStorageGet("valuesProfile") ??
        safeLocalStorageGet("valuesProfile");
      if (storedProfile) {
        setProfile(
          hydrateValuesProfile(JSON.parse(storedProfile) as Partial<ValuesProfile>)
        );
        safeSessionStorageSet("valuesProfile", storedProfile);
      }

      const queryStep = params.get("step");
      const storedStep =
        queryStep ??
        safeSessionStorageGet(ONBOARDING_STEP_KEY) ??
        safeLocalStorageGet(ONBOARDING_STEP_KEY);

      if (storedStep) {
        const parsedStep = Number.parseInt(storedStep, 10);
        setStep(clampStep(queryStep ? parsedStep - 1 : parsedStep));
      }
      setHasHydrated(true);
    }

    void hydrateDraft();
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;

    const serializedProfile = JSON.stringify(profile);
    saveBrowserDraft("valuesProfile", serializedProfile);
    saveBrowserDraft(ONBOARDING_STEP_KEY, String(step));
  }, [hasHydrated, profile, step]);

  const handleRatingChange = useCallback((issue: Issue, value: number) => {
    setProfile((prev) => ({
      ...prev,
      issueRatings: { ...prev.issueRatings, [issue]: value },
    }));
  }, []);

  const handleFreeTextChange = useCallback((value: string) => {
    setProfile((prev) => ({ ...prev, freeText: value }));
  }, []);

  const handlePolicySignalChange = useCallback(
    (signal: PolicySignal, value: ValuesProfile["policySignals"][PolicySignal]) => {
      setProfile((prev) => ({
        ...prev,
        policySignals: { ...prev.policySignals, [signal]: value },
      }));
    },
    []
  );

  const handleIdentityChange = useCallback(
    (value: PoliticalIdentity | null) => {
      setProfile((prev) => ({ ...prev, politicalIdentity: value }));
    },
    []
  );

  const canAdvance = (): boolean => {
    switch (step) {
      case 0:
        // Issue ratings always have defaults, so always valid
        return true;
      case 1:
        // Policy signals are optional
        return true;
      case 2:
        // Free text is optional
        return true;
      case 3:
        // Identity is optional
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) {
      setStep((currentStep) => currentStep + 1);
    } else {
      const saved = saveBrowserDraft("valuesProfile", JSON.stringify(profile));
      if (!saved) {
        setStorageError(
          "Could not save your profile in this browser. Free up browser storage and try again."
        );
        return;
      }
      setStorageError(null);
      // Also persist to Supabase for logged-in users (fire-and-forget)
      saveValuesProfile(profile);
      router.push("/ballot");
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep((currentStep) => currentStep - 1);
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8 sm:py-16">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Your Values Profile
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Help us understand what matters to you so we can match candidates to
            your priorities.
          </p>
        </div>

        {/* Progress */}
        <StepProgress
          currentStep={step}
          totalSteps={TOTAL_STEPS}
          stepLabels={STEP_LABELS}
        />

        {/* Step content */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            {storageError && (
              <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                {storageError}
              </div>
            )}
            {step === 0 && (
              <IssueRater
                ratings={profile.issueRatings}
                onRatingChange={handleRatingChange}
              />
            )}
            {step === 1 && (
              <PolicySignalSelector
                value={profile.policySignals}
                onChange={handlePolicySignalChange}
              />
            )}
            {step === 2 && (
              <FreeTextInput
                value={profile.freeText}
                onChange={handleFreeTextChange}
              />
            )}
            {step === 3 && (
              <IdentitySelector
                value={profile.politicalIdentity}
                onChange={handleIdentityChange}
              />
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={step === 0}
          >
            Back
          </Button>
          <Button onClick={handleNext} disabled={!canAdvance()}>
            {step === TOTAL_STEPS - 1 ? "Continue to Ballot" : "Next"}
          </Button>
        </div>
      </div>
    </main>
  );
}
