// src/firebase-mfa.js
import {
    RecaptchaVerifier,
    PhoneAuthProvider,
    PhoneMultiFactorGenerator,
    getMultiFactorResolver,
    multiFactor,
} from "firebase/auth";
import { auth } from "./src/firebase";

let _recaptcha;
export function getRecaptcha() {
    if (!_recaptcha) {
        _recaptcha = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
    }
    return _recaptcha;
}
export function resetRecaptcha() {
    try { _recaptcha?.clear(); } catch { }
    _recaptcha = null;
}

// === enrollment (unchanged) ===
export async function startPhoneMfaEnrollment(user, phoneNumber) {
    const mfaSession = await multiFactor(user).getSession();
    const verificationId = await new PhoneAuthProvider(auth).verifyPhoneNumber(
        { phoneNumber, session: mfaSession },
        getRecaptcha()
    );
    return verificationId;
}

export async function finishPhoneMfaEnrollment(user, verificationId, smsCode, displayName = "Phone") {
    const cred = PhoneAuthProvider.credential(verificationId, smsCode);
    const assertion = PhoneMultiFactorGenerator.assertion(cred);
    await multiFactor(user).enroll(assertion, displayName);
}

// === resolve sign-in (unchanged) ===
export async function resolveMfaSignInFromError(error, smsCode) {
    const resolver = getMultiFactorResolver(auth, error);
    const phoneHint = resolver.hints.find(h => h.factorId === PhoneMultiFactorGenerator.FACTOR_ID);
    const verificationId = await new PhoneAuthProvider(auth).verifyPhoneNumber(
        { multiFactorHint: phoneHint, session: resolver.session },
        getRecaptcha()
    );
    const cred = PhoneAuthProvider.credential(verificationId, smsCode);
    const assertion = PhoneMultiFactorGenerator.assertion(cred);
    return resolver.resolveSignIn(assertion);
}