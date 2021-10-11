const express = require("express");
const session = require('express-session');
const bodyParser = require("body-parser");
const ejs = require("ejs");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const oauth = require('passport-google-oauth20').Strategy;
const mongoose = require("mongoose");
const findOrCreate = require('mongoose-findorcreate');
const MongoClient = require("mongodb").MongoClient;
const { MongoNetworkTimeoutError } = require('mongodb');
const nodemailer = require('nodemailer');
const hash=require('md5')
require('dotenv').config();

const app = express();

app.use(express.static(__dirname + '/public'));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(session({
    secret: "hello",
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect(process.env.MONGO, { useNewUrlParser: true, useUnifiedTopology: true });


const notesSchema = new mongoose.Schema({
    _id:String,
    id: String,
    title: String,
    description: String,
    password:String
})

const Note = new mongoose.model("Note", notesSchema)

const userSchema = new mongoose.Schema({
    googleId: String,
    username: String,
    picture: String,
    fname: String,
    notes: [notesSchema],
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);
const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user, done) {
    done(null, user.id);
});

passport.deserializeUser(function(id, done) {
    User.findById(id, function(err, user) {
        done(err, user);
    });
});


passport.use(new oauth({
        clientID: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
         callbackURL: "http://localhost:5000/auth/google/notify",
        userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
        passReqToCallback: true,

    },
    function(req, accessToken, refreshToken, profile, cb) {

        console.log(profile);
        currentid = profile.id;
        req.session.new=profile.id;
        req.session.email = profile.emails[0].value;
        
        
        User.findOrCreate({ username: profile.emails[0].value, googleId: profile.id, picture: profile.photos[0].value, fname: profile.displayName }, function(err, user) {
            req.session.accessToken = accessToken;
            req.session.refreshToken = refreshToken
            return cb(err, user);
        });
    }
    ));

app.route("/")
    .get((req, res) => {
        console.log(req.session.new)
        res.render('index');
    });

app.get('/login',
    passport.authenticate('google', { scope: ['profile', "email"] }));

app.get("/auth/google/notify",
    passport.authenticate('google', { failureRedirect: "/" }),
    function(req, res) {
        res.redirect("/notes");
    });

app.route('/notes')
    .get((req,res)=>{

        User.findOne({ googleId: req.session.new}, function(err, foundUser) {
            
            res.render('notes',{notes:foundUser.notes})
        });

    });    

app.route('/new')
    .post((req,res)=>{

        let id=new Date().getTime()
        password=""

        if(req.body.submit==='pwd')
        {
            password=hash(req.body.password)
        }
        else{
            let temp=hash(id)
            temp=temp.substring(0,8)
            password=hash(temp)

           message = `
           <h1>Greetings from Notify</h1>
          <h3>The randomly generated password for your note titled ${req.body.title} is ${temp}.
          </h3>
          <h2>This ia an auto genearted mail. Please do not reply back.</h2>
          `;

            let transporter = nodemailer.createTransport({
                service: 'gmail',
                port: 587,
                secure: false,
                auth: {
                    user: 'notifyindia2021@gmail.com',
                    pass: process.env.PASSWORD,
                },
                tls: {
                    rejectUnauthorized: false
                }
            });
        
            let mailOptions = {
                from: '"Notify" <notifyindia2021@gmail.com>',
                to: req.session.email,
                subject: 'New Note added',
                html: message
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    return console.log(error);
                }
                console.log('Message sent: %s', info.messageId);
                console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
        
                res.render('contact', { msg: 'Email has been sent' });
            });
    }


        const note= new Note({
            title:req.body.title,
            description:req.body.description,
            password:password,
            id:id,
            _id:id
        })

        User.findOne({ googleId: req.session.new}, function(err, foundUser) {
            foundUser.notes.push(note);
            foundUser.save();
            res.redirect("/notes");
        });
    

    });

app.route('/pwd')
    .post((req,res)=>{
        User.findOne({ googleId: req.session.new}, function(err, foundUser) {

            let notes=foundUser.notes
            let usernote=""
            let check=false

            notes.forEach(function(note)  {
                if(note.id===req.body.id )
                {
                    if(note.password===hash(req.body.password))
                    {
                        usernote=note;
                        check=true
                    }

                }
            });

            if(check)
            {
                res.render('note',{note:usernote})
            }
            else
            {
                res.redirect('notes')
            }

        });


    }); 
    
    
app.route('/delete')
    .post((req,res)=>{

        User.findOne({ googleId: req.session.new}, function(err, foundUser) {

           
           
            let idi=req.body.id;
            console.log(req.body.id)
            foundUser.notes.pull({ idi });
            foundUser.save();

            res.redirect('notes');
        
        });
    });    
    
app.listen(process.env.PORT || 5000, () => {
    console.log('RUNNING ON PORT 5000')
});