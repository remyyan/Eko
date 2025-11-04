// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA2xMR2nOET8S7LPctkpXEKVLXn3knD4uk",
  authDomain: "eko100.firebaseapp.com",
  projectId: "eko100",
  storageBucket: "eko100.firebasestorage.app",
  messagingSenderId: "744225927939",
  appId: "1:744225927939:web:5dd6aea457f2a108706f36",
  measurementId: "G-5S8WFNL37L"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);