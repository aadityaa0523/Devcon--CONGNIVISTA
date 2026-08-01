import { createContext, useContext, type ReactNode } from "react";
import { useBiometricCapture } from "./useBiometricCapture";

type BiometricValue = ReturnType<typeof useBiometricCapture>;

const Ctx = createContext<BiometricValue | null>(null);

/**
 * One shared capture state for the whole app.
 *
 * Previously each panel called useBiometricCapture directly, so every one held
 * its own copy of the enrolment and its own microphone level. That worked only
 * because enrolment is re-read from localStorage; live state such as the mic
 * amplitude driving the orb could never have been shared.
 */
export function BiometricProvider({ children }: { children: ReactNode }) {
  const value = useBiometricCapture();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBiometrics(): BiometricValue {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error("useBiometrics must be used inside <BiometricProvider>");
  }
  return value;
}
