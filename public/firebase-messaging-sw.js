importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  "projectId": "studio-9716245358-f94b8",
  "appId": "1:191916666635:web:0669e3f97efab26de5bc0e",
  "storageBucket": "studio-9716245358-f94b8.appspot.com",
  "apiKey": "AIzaSyAyYJsqDfKOfXMUsI8Bht2V02mNzXIID1M",
  "authDomain": "studio-9716245358-f94b8.firebaseapp.com",
  "messagingSenderId": "191916666635"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: payload.notification.image || '/icon-192x192.png',
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
