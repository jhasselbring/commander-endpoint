const { exec, execSync } = require('child_process');
const fs = require('firebase-admin');
const os = require("os");
var hostname = os.hostname();
const { collection, query, where, onSnapshot, SetOptions } = require("firebase/firestore");
const serviceAccount = require('./service-account.json');

fs.initializeApp({
    credential: fs.credential.cert(serviceAccount)
});

const db = fs.firestore();

const OS = process.platform;
const ID = hostname + '[' + OS + ']';
const NAME = hostname;
let lastCommandTime = 0;

let commands = db.collection('commands');
let endpoints = db.collection('endpoints');

// Main
(() => {
    console.log('Initializing Commander');
    const USER = getUser();

    // Register this endpoint
    endpoints.doc(ID).set({
        id: ID,
        os: OS,
        name: NAME,
        lastPing: getNowSeconds(),
        user: USER
    }, { merge: true });

    // Initialize the command document
    commands.doc(ID).set({
        command: '',
        response: '',
        lastCommandTime: lastCommandTime
    });

    // Wait for command
    commands
        .onSnapshot(querySnapshot => {
            querySnapshot.docChanges().forEach(change => {
                if (change.type === 'modified') {
                    // console.log('Command Data: ', change.doc.id, change.doc.data());
                    if (change.doc.id == ID && change.doc.data().lastCommandTime > lastCommandTime) {
                        lastCommandTime = change.doc.data().lastCommandTime;
                        if (change.doc.data().command.includes('cd ')) {
                            newOrder('(cd "' + change.doc.data().wd + '" && ' + change.doc.data().command + ') && ' + getCWD())
                        }
                        else {
                            newOrder('cd "' + change.doc.data().wd + '" && ' + change.doc.data().command)
                        }
                    }
                }
            });
        });
})();

function getNowSeconds() {
    return Math.floor(new Date().getTime() / 1000);
}
function getUser() {
    switch (OS) {
        case 'linux':
            return execSync('echo "$USER"', { maxBuffer: 1024 * 3000, encoding: "UTF-8" }).trim();
        case 'win32':
            return execSync('whoami', { maxBuffer: 1024 * 3000, encoding: "UTF-8" }).trim().split('\\')[1];
    }
}
function getCWD() {
    switch (OS) {
        case 'linux':
            return 'pwd';
        case 'win32':
            return '(echo|cd)';
    }
}
// Execute command
const newOrder = (order) => {
    console.log(order)
    exec(order, { maxBuffer: 1024 * 3000, encoding: "UTF-8" }, (error, response, stderr) => {
        if (error) {
            commands.doc(ID).update({
                lastResponseTime: getNowSeconds(),
                response: {
                    success: false,
                    message: stderr
                }
            })
        } else {
            let responsePayload = {
                success: true,
                message: response
            }
            if (order.includes('&& pwd') || order.includes('&& (echo|cd)')) {
                responsePayload.pwd = response.trim();
                responsePayload.message = '';
            }
            console.log('Success:', responsePayload);
            commands.doc(ID).update({ lastResponseTime: Math.floor(new Date().getTime() / 1000), response: responsePayload })
        }
    });
}

setInterval(() => {
    endpoints.doc(ID).update({
        lastPing: Math.floor(new Date().getTime() / 1000)
    });
}, 1000 * 60)