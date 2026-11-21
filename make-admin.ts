import 'dotenv/config';
import { initializeApp, applicationDefault, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
let credential = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
} else {
  credential = applicationDefault();
}

const app = getApps().length === 0 ? initializeApp({
  credential,
  projectId: config.projectId,
}) : getApps()[0];

const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const email = 'adamu0533@gmail.com';
  const snapshot = await db.collection('users').where('email', '==', email).get();
  if (snapshot.empty) {
    console.log('User not found in db.');
    return;
  }
  snapshot.forEach(async (doc) => {
    await doc.ref.update({ isAdmin: true });
    console.log(`Updated user ${email} to be an admin.`);
  });
}

run();
