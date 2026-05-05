import { createClient } from "@supabase/supabase-js";
import {
  initFaceLogin,
  loginWithFace,
  registerFace,
} from "../face-login.js";
import "./styles.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const elements = {
  camera: document.querySelector("#camera"),
  cameraStatus: document.querySelector("#cameraStatus"),
  email: document.querySelector("#email"),
  loginActions: document.querySelector("#loginActions"),
  loginButton: document.querySelector("#loginButton"),
  loginTab: document.querySelector("#loginTab"),
  registerButton: document.querySelector("#registerButton"),
  registerForm: document.querySelector("#registerForm"),
  registerTab: document.querySelector("#registerTab"),
  result: document.querySelector("#result"),
  statusText: document.querySelector("#statusText"),
};

let isReady = false;

boot();

elements.loginTab.addEventListener("click", () => setMode("login"));
elements.registerTab.addEventListener("click", () => setMode("register"));
elements.loginButton.addEventListener("click", handleLogin);
elements.registerForm.addEventListener("submit", handleRegister);

async function boot() {
  if (!supabaseUrl || !supabaseAnonKey) {
    setStatus("error", "Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.");
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    await initFaceLogin({
      supabase,
      video: elements.camera,
      modelsUrl: "/models",
    });

    isReady = true;
    setStatus("ready", "Camera ready. Face models loaded.");
  } catch (error) {
    setStatus("error", readableError(error));
  }
}

async function handleLogin() {
  if (!guardReady()) {
    return;
  }

  setBusy(elements.loginButton, true, "Scanning...");
  showResult("Looking for a matching registered face.", "pending");

  try {
    const match = await loginWithFace();

    if (!match.matched) {
      showResult(
        `No confident match found. Match score: ${match.distance.toFixed(3)}. Required: below ${match.threshold.toFixed(2)}. Sit about 50cm from the camera and register again if needed. Usable profiles: ${match.usableProfiles}/${match.checkedProfiles}.`,
        "error",
      );
    }
  } catch (error) {
    showResult(readableError(error), "error");
  } finally {
    setBusy(elements.loginButton, false, "Scan Face");
  }
}

async function handleRegister(event) {
  event.preventDefault();

  if (!guardReady()) {
    return;
  }

  const email = elements.email.value.trim();

  if (!email) {
    showResult("Enter the profile email before registering.", "error");
    elements.email.focus();
    return;
  }

  setBusy(elements.registerButton, true, "Registering...");
  showResult("Capturing face descriptor.", "pending");

  try {
    await registerFace(email);
    showResult(`Face descriptor saved for ${email}. Use the same 50cm camera distance when logging in.`, "success");
  } catch (error) {
    showResult(readableError(error), "error");
  } finally {
    setBusy(elements.registerButton, false, "Register Face");
  }
}

function setMode(mode) {
  const isRegister = mode === "register";

  elements.registerForm.classList.toggle("hidden", !isRegister);
  elements.loginActions.classList.toggle("hidden", isRegister);
  elements.registerTab.classList.toggle("active", isRegister);
  elements.loginTab.classList.toggle("active", !isRegister);
  elements.result.textContent = "";
  elements.result.className = "result";

  if (isRegister) {
    elements.email.focus();
  }
}

function guardReady() {
  if (isReady) {
    return true;
  }

  showResult("The camera and models are still loading.", "pending");
  return false;
}

function setStatus(type, message) {
  elements.cameraStatus.className = `status-dot ${type}`;
  elements.statusText.textContent = message;
}

function showResult(message, type) {
  elements.result.textContent = message;
  elements.result.className = `result ${type}`;
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = label;
}

function readableError(error) {
  return error instanceof Error ? error.message : String(error);
}
