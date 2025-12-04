// src/api/kyc.js
import fetch from "node-fetch";
import crypto from "crypto";

const SUMSUB_APP_TOKEN = process.env.SUMSUB_APP_TOKEN;
const SUMSUB_SECRET_KEY = process.env.SUMSUB_SECRET_KEY;
const SUMSUB_BASE_URL = process.env.SUMSUB_BASE_URL 
 

// Utility: generate HMAC signature
// function signRequest(ts, method, path) {
//   return crypto
//     .createHmac("sha256", SUMSUB_SECRET_KEY)
//     .update(ts + method + path)
//     .digest("hex");
// }
export function signRequest(ts, method, path, body = "") {
    const hmac = crypto.createHmac("sha256", SUMSUB_SECRET_KEY);
    hmac.update(ts + method.toUpperCase() + path + body);
    return hmac.digest("hex");
  }

// Create Sumsub applicant
export async function createApplicant({ externalUserId, email, country = "EGY", placeOfBirth = "EGY" }) {
  const method = "POST";
  const path = "/resources/applicants?levelName=id-only";
  const ts = Math.floor(Date.now() / 1000);
  
  const body = {
    externalUserId,
    email,
    fixedInfo: {
      country,
      placeOfBirth,
    },
  };
  const bodyStr = JSON.stringify(body);

  const sig = signRequest(ts, method, path, bodyStr);

  const res = await fetch(`${SUMSUB_BASE_URL}${path}`, {
    method,
    headers: {
        "Content-Type": "application/json",
        "X-App-Token": process.env.SUMSUB_APP_TOKEN,
        "X-App-Access-Ts": ts,
        "X-App-Access-Sig": sig,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
      },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errorPayload;
  
    try {
      // Try to parse JSON first
      errorPayload = await res.json();
    } catch {
      // Fallback to plain text if JSON parsing fails
      errorPayload = await res.text();
    }
  
    console.error("❌ Failed to create applicant:", {
      status: res.status,
      sig,
      ts,
      path,
      body,
      error: errorPayload,
    });
  
    // Throw the JSON object, not text
    throw new Error(JSON.stringify(errorPayload, null, 2));
  }
}

// Create SDK access token
export async function createAccessToken(externalUserId, levelName = "id-only") {
    const method = "POST";
    const path = "/resources/accessTokens/sdk";
    const ts = Math.floor(Date.now() / 1000);
  
    const body = {
      userId: externalUserId,
      levelName,
    };
    const bodyStr = JSON.stringify(body);
  
    const sig = signRequest(ts, method, path, bodyStr);
  
    const res = await fetch(`${SUMSUB_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-App-Token": process.env.SUMSUB_APP_TOKEN,
        "X-App-Access-Ts": ts,
        "X-App-Access-Sig": sig,
      },
      body: bodyStr,
    });
  
    if (!res.ok) {
      const errText = await res.text();
      console.error("❌ Failed to create access token:", {
        status: res.status,
        sig,
        ts,
        path,
        body,
        errText,
      });
      throw new Error(`Failed to create access token (${res.status})`);
    }
  
    return res.json(); // { token, ttlInSecs }
  }
  
// Fetch applicant status
export async function getApplicantStatus(applicantId) {
    const method = "GET";
    const path = `/resources/applicants/${applicantId}/status`;
    const ts = Math.floor(Date.now() / 1000);
    const sig = signRequest(ts, method, path);
  
    const res = await fetch(`${SUMSUB_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-App-Token": process.env.SUMSUB_APP_TOKEN,
        "X-App-Access-Ts": ts,
        "X-App-Access-Sig": sig,
      },
    });
     // 6911033d09d61adba8b0e3d4
    if (!res.ok) {
      const errText = await res.text();
      console.error("❌ Failed to get applicant status:", {
        status: res.status,
        sig,
        ts,
        path,
        errText,
      });
      if (res.status == 404)
      {
        return "approved"
      }
    }
  
    const data = await res.json();
    if (data.reviewStatus == "completed"){
        return "rejected"
    }
    return data.reviewStatus || "init";
  }
  