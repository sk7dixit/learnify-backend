// src/config/firebaseConfig.js

const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAHlk5Qt7xkGSHXnZ97BdVff3WbH6sI3qA",
  authDomain: "learnify-chat-bd1d7.firebaseapp.com",
  projectId: "learnify-chat-bd1d7",
  storageBucket: "learnify-chat-bd1d7.appspot.com",
  messagingSenderId: "470971321185",
  appId: "1:470971321185:web:11b191e59dcc455f08d320",
  measurementId: "G-B4WJ9367NL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

module.exports = { db };
