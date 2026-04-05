/*
CSC3916 HW4
File: Server.js
Description: Web API scaffolding for Movie API
 */

var express = require('express');
var bodyParser = require('body-parser');
var passport = require('passport');
var mongoose = require('mongoose');
var authController = require('./auth');
var authJwtController = require('./auth_jwt');
var jwt = require('jsonwebtoken');
var cors = require('cors');
var User = require('./Users');
var Movie = require('./Movies');
var Review = require('./Reviews');
const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = "mongodb+srv://CashCSCI:c4ZC1fGG74CYpRe9@csci-3916.arolsmk.mongodb.net/?retryWrites=true&w=majority&appName=CSCI-3916";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    await client.close();
  }
}
run().catch(console.dir);

var app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(passport.initialize());

var router = express.Router();

function getJSONObjectForMovieRequirement(req) {
    var json = {
        headers: "No headers",
        key: process.env.UNIQUE_KEY,
        body: "No body"
    };

    if (req.body != null) {
        json.body = req.body;
    }

    if (req.headers != null) {
        json.headers = req.headers;
    }

    return json;
}

router.all('/signup', (req, res) => {
    // Returns a message stating that the HTTP method is unsupported.
    res.status(405).send({ message: 'HTTP method not supported.' });
});

router.post('/signin', async function (req, res) {
    var userNew = new User();
    userNew.username = req.body.username;
    userNew.password = req.body.password;

    try {
        const user = await User.findOne({ username: userNew.username }).select('name username password').exec();
        
        if (!user) {
            return res.status(401).send({success: false, msg: 'Authentication failed. User cannot be located.'});
        }

        const isMatch = await user.comparePassword(userNew.password);

        if (isMatch) {
            var userToken = { id: user.id, username: user.username };
            var token = jwt.sign(userToken, process.env.SECRET_KEY); 
            res.json({success: true, token: 'JWT ' + token});
        } else {
            res.status(401).send({success: false, msg: 'Authentication failed. Wrong password.'});
        }
    } catch (err) {
        res.status(500).send({success: false, msg: err.message || 'An error occurred'});
    }
});

router.all('/signin', (req, res) => {
    // Returns a message stating that the HTTP method is unsupported.
    res.status(405).send({ message: 'HTTP method not supported.' });
});

router.route('/movies/:title')
    .get(authJwtController.isAuthenticated, async function (req, res) {
        try {
            const data = await Movie.findOne({title: req.params.title});
            if (!data) {
                res.json({status: 400, message: "Movie ''" + req.params.title + "'' couldn't be found."})
            }
            else {
                res.json({status: 200, message: "" + req.params.title + " was found!", movie: data});
            }
        } catch (err) {
            res.json({status: 400, message: "Movie ''" + req.params.title + "'' couldn't be found."})
        }
    })

    .post(authJwtController.isAuthenticated, (req, res) => {
        res.json({status: 400, message: "Invalid action."})
    })

    .put(authJwtController.isAuthenticated, async function(req, res) {
        try {
            const doc = await Movie.findOneAndUpdate(
                {title: req.params.title}, { 
                    title: req.body.title,
                    releaseDate: req.body.releaseDate,
                    genre: req.body.genre,
                    actors: req.body.actors 
                },
                { new: true }
            );

            if (!doc) {
                res.json({ message: "Movie not found." });
            }
            else {
                res.json({ status: 200, message: "" + req.body.title + " UPDATED"});
            }
        } catch (err) {
            res.json({ message: "Movie could not be updated." });
        }
    })

    .delete(authJwtController.isAuthenticated, async function(req, res) {
        try {
            const data = await Movie.findOneAndDelete({title: req.params.title});
            if (!data) {
                res.json({message: "There was an issue trying to find your movie"})
            }
            else {
                res.json({message: "" + req.params.title + " DELETED"});
            }
        } catch (err) {
            res.json(err);
        }
    })
    
    .all((req, res) => {
        // Any other HTTP Method
        // Returns a message stating that the HTTP method is unsupported.
        res.status(405).send({ message: 'HTTP method not supported.' });
    }
);

router.route('/movies')
    .get(authJwtController.isAuthenticated, function (req, res) {
        if(req.query.movieId != null){
            Movie.find({_id: mongoose.Types.ObjectId(req.query.movieId)}, 'title', function(err, data) {
                if (err || data.length == 0) {
                    res.json({status: 400, message: "No movies found."})
                }
                else {
                    const movieTitles = data.map(movie => movie.title);
                    res.json({status: 200, message: "Movies found!", titles: movieTitles});

                    if(req.query.reviews == "true" || req.query.reviews == "True"){
                        Movie.aggregate([
                            {
                                $match: {'_id': mongoose.Types.ObjectId(req.query.movieId)}
                            },
                            {
                                $lookup:{
                                    from: 'reviews',
                                    localField: '_id',
                                    foreignField: 'movieId',
                                    as: 'Reviews'
                                }
                            }],function(err, doc) {
                            if(err){
                                console.log("Error encountered.");
                                res.send(err);
                            }
                            else{
                                console.log(doc);
                                res.json(doc);
                            }
                        });
                    }
                    else{
                        res.json(data);
                    }
                }
            });
        }
        else{
            Movie.find({}, function(err, doc){
                if(err){
                    res.json({error: err});
                }
                else{
                    if(req.query.reviews == "true" || req.query.reviews == "True"){
                        Movie.aggregate([{
                            $lookup:{
                                from: 'reviews',
                                localField: '_id',
                                foreignField: 'movieId',
                                as: 'Reviews'
                            }
                        }], function(err, data) {
                            if(err){
                                res.send(err);
                            }
                            else{
                                res.json(data);
                            }
                        });
                    }
                    else{
                        res.json(doc);
                    }
                }
            })
        }
    })
    
    .post(authJwtController.isAuthenticated, function(req, res) {
        Movie.findOne({title: req.body.title}, function(err) {
            if (err) {
                res.status(400);
            }
            else if (req.body.actors.length < 3) {
                res.json({message: "Not enough actors. (You need at least 3)"});
            }
            else {
                var newMovie = new Movie();
                newMovie.title = req.body.title;
                newMovie.releaseDate = req.body.releaseDate;
                newMovie.genre = req.body.genre;
                newMovie.actors = req.body.actors;
                
                newMovie.save(function (err) {
                    if (err) {
                    res.json({message: err});
                    }
                    else {
                        res.json({status: 200, success: true, message: "" + req.body.title + " SAVED"});
                    }
                });
            }

        });
    })

    .put(authJwtController.isAuthenticated, (req, res) => {
        res.json({status: 400, message: "Invalid action."})
    })

    .delete(authJwtController.isAuthenticated, (req, res) => {
        res.json({status: 400, message: "Invalid action."})
    })

    .all((req, res) => {
        // Any other HTTP Method
        // Returns a message stating that the HTTP method is unsupported.
        res.status(405).send({ message: 'HTTP method not supported.' });
    }
);

router.route('/reviews')
    .post(authJwtController.isAuthenticated, function(req,res){
        
        const usertoken = req.headers.authorization;
        const token = usertoken.split(' ');
        const decoded = jwt.verify(token[1], process.env.SECRET_KEY);

        Movie.find({_id: req.body.movieId}, function(err, data){
            if(err){
                res.status(400).json({message: "Invalid query."});
            }
            else if (data != null){
                let rev = new Review({
                    Name: decoded.username,
                    content: req.body.content,
                    rating: req.body.rating,
                    movieId: req.body.movieId
                });

                console.log(req.body);

                rev.save(function(err){
                    if(err) {
                        res.json({message: err});
                    }
                    else{
                        Review.find({movieId: req.body.movieId}, function (err, allReviews) {
                            if(err){
                                res.status(400).json({message: "Error encountered."});
                            }
                            else{
                                if (err){
                                    res.json({error: err});
                                }
                                else if(rev.content != null){
                                    res.json({msg: "Review successfully saved!"});
                                }
                            }
                        });
                    }
                });
            }
            else{
                res.json({failure: "This movie does not exist."});
            }
        });
    })

    .get(authJwtController.isAuthenticated, function (req, res) {
        Review.find({}, 'content', function(err, data) {
            if (err || data.length == 0) {
                res.json({status: 400, message: "No reviews found."})
            }
            else {
                const allReviews = data.map(review => review.content);
                res.json({status: 200, message: "REVIEWS", reviews: allReviews});
            }
        })
    });

app.use('/', router);

app.use('/', router);
app.listen(process.env.PORT || 8080);
module.exports = app; // for testing only
