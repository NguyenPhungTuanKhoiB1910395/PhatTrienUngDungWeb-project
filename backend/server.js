const express = require("express")
const app = express()
const http = require("http").createServer(app)
const mongodb = require("mongodb")

const MongoClient = mongodb.MongoClient
const ObjectId = mongodb.ObjectId

app.use(function (req, res, next) {

    // Website you wish to allow to connect
    res.setHeader("Access-Control-Allow-Origin", "*")

    // Request methods you wish to allow
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE")

    // Request headers you wish to allow
    res.setHeader("Access-Control-Allow-Headers", "X-Requested-With,content-type,Authorization")

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader("Access-Control-Allow-Credentials", true)

    // Pass to next layer of middleware
    next()
})

const expressFormidable = require("express-formidable")
app.use(expressFormidable())

const bcrypt = require("bcrypt");

const jwt = require("jsonwebtoken");
const jwtSecret = "hst193dafoqvev";

const auth = require("./modules/auth");
// custom modules
const contact = require("./modules/contact");
const chat = require("./modules/chat");

// sockets are used for realtime communication
const socketIO = require("socket.io")(http, {
    cors: {
        origin: ["http://localhost:8080"]
    }
});
 
// array that holds all connected users socket ID
global.users = [];

const port = (process.env.PORT || 3000)

http.listen(port, function () {
    console.log("Server has been started at: " + port)
    MongoClient.connect("mongodb://localhost:27017", function (error, client) {
        if (error) {
            console.error(error)
            return
        }
        db = client.db("vchat")
        global.db = db
        console.log("Database connected")

        socketIO.on("connection", function (socket) {
 
            socket.on("connected", function (email) {
                users[email] = socket.id;
         
                console.log(users);
            });
        });

        contact.init(app, express);
        chat.init(app, express);  	
        chat.socketIO = socketIO;

        app.post("/getUser", auth, async function (request, result) {
            const user = request.user;
         
            result.json({
                status: "success",
                message: "Data has been fetched.",
                user: user
            });
        });

        // route for login requests
        app.post("/login", async function (request, result) {

            // get values from login form
            const email = request.fields.email;
            const password = request.fields.password;

            // check if email exists
            const user = await db.collection("users").findOne({
                "email": email
            });

            if (user == null) {
                result.json({
                    status: "error",
                    message: "Email does not exists."
                });
                return;
            }

            // check if password is correct
            bcrypt.compare(password, user.password, async function (error, isVerify) {
                if (isVerify) {

                    // generate JWT of user
                    const accessToken = jwt.sign({
                        "userId": user._id.toString()
                    }, jwtSecret);

                    // update JWT of user in database
                    await db.collection("users").findOneAndUpdate({
                        "email": email
                    }, {
                        $set: {
                            "accessToken": accessToken
                        }
                    });

                    result.json({
                        status: "success",
                        message: "Login successfully.",
                        accessToken: accessToken
                    });

                    return;
                }

                result.json({
                    status: "error",
                    message: "Password is not correct."
                });
            });
        });

        // route for register requests 
        app.post("/registration", async function (request, result) {
            const name = request.fields.name;
            const email = request.fields.email;
            const password = request.fields.password;
            const createdAt = new Date().getTime();

            if (!name || !email || !password) {
                result.json({
                    status: "error",
                    message: "Please enter all values."
                });
                return;
            }

            // check if email already exists
            var user = await db.collection("users").findOne({
                email: email
            });

            if (user != null) {
                result.json({
                    status: "error",
                    message: "Email already exists."
                });
                return;
            }

            // encrypt the password
            bcrypt.hash(password, 10, async function (error, hash) {

                // insert in database
                await db.collection("users").insertOne({
                    name: name,
                    email: email,
                    password: hash,
                    accessToken: "",
                    contacts: [],
                    notifications: [],
                    createdAt: createdAt
                });

                result.status(200).json({
                    status: "success",
                    message: "Account has been created. Please login now."
                });
            });
        });

        // route for logout request
        app.post("/logout", auth, async function (request, result) {
            const user = request.user
        
            // update JWT of user in database
            await db.collection("users").findOneAndUpdate({
                _id: user._id
            }, {
                $set: {
                    accessToken: ""
                }
            })
        
            result.json({
                status: "success",
                message: "Logout successfully."
            })
        });
        app.post("/search", auth, async function (request, result) {
            // get authenticated user
            const user = request.user;
         
            // get searched query
            const query = request.fields.query;
         
            // create an empty array
            const contacts = [];
         
            // loop through all contacts
            for (let a = 0; a < user.contacts.length; a++) {
         
                // check where name or email matches with query
                if (user.contacts[a].name.includes(query)
                    || user.contacts[a].email.includes(query)) {
         
                    // add in contacts array
                    contacts.push(user.contacts[a]);
                }
            }
         
            // return the new contacts array
            result.json({
                status: "success",
                message: "Data has been fetched.",
                contacts: contacts
            });
        });
    });
})