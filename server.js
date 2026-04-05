/*
CSC3916 HW4
File: Server.js
Description: Web API scaffolding for Movie API
 */

const express = require('express');
const bodyParser = require('body-parser');
const passport = require('passport');
const authJwtController = require('./auth_jwt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const mongoose = require('mongoose'); // Explicitly require mongoose for ObjectId
const User = require('./Users');
const Movie = require('./Movies');
const Review = require('./Reviews');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(passport.initialize());

const router = express.Router();

// Route for user signup
router.post('/signup', async (req, res) => {
    if (!req.body.username || !req.body.password) {
        return res.status(400).json({ success: false, msg: 'Please include both username and password to signup.' });
    }

    const user = new User({
        name: req.body.name,
        username: req.body.username,
        password: req.body.password
    });

    try {
        await user.save();
        res.status(201).json({ success: true, msg: 'Successfully created new user.' });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ success: false, msg: 'A user with that username already exists.' });
        }
        return res.status(500).json({ success: false, msg: 'An error occurred during signup.', error: err.message });
    }
});

// Route for user signin
router.post('/signin', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.body.username }).select('name username password').exec();

        if (!user) {
            return res.status(401).send({ success: false, msg: 'Authentication failed. User not found.' });
        }

        const isMatch = await user.comparePassword(req.body.password);

        if (isMatch) {
            const userToken = { id: user._id, username: user.username };
            const token = jwt.sign(userToken, process.env.SECRET_KEY, { expiresIn: '1h' }); // Add token expiration
            res.json({ success: true, token: 'JWT ' + token });
        } else {
            res.status(401).send({ success: false, msg: 'Authentication failed. Wrong password.' });
        }
    } catch (err) {
        res.status(500).send({ success: false, msg: 'An internal server error occurred.', error: err.message });
    }
});

// Route for Movies collection
router.route('/movies')
    // GET all movies, with optional reviews
    .get(authJwtController.isAuthenticated, async (req, res) => {
        try {
            const { reviews } = req.query;
            const showReviews = reviews === 'true' || reviews === 'True';

            if (showReviews) {
                const moviesWithReviews = await Movie.aggregate([
                    {
                        $lookup: {
                            from: 'reviews', // The collection name for Review model
                            localField: '_id',
                            foreignField: 'movieId',
                            as: 'reviews'
                        }
                    }
                ]);
                res.status(200).json({ success: true, movies: moviesWithReviews });
            } else {
                const movies = await Movie.find({});
                res.status(200).json({ success: true, movies: movies });
            }
        } catch (err) {
            res.status(500).json({ success: false, msg: 'Failed to retrieve movies.', error: err.message });
        }
    })
    // POST a new movie
    .post(authJwtController.isAuthenticated, async (req, res) => {
        try {
            if (!req.body.title || !req.body.releaseDate || !req.body.genre || !req.body.actors) {
                return res.status(400).json({ success: false, msg: "Please provide all required fields: title, releaseDate, genre, actors." });
            }
            if (!Array.isArray(req.body.actors) || req.body.actors.length < 3) {
                return res.status(400).json({ success: false, msg: "A movie must have at least 3 actors." });
            }

            const newMovie = new Movie({
                title: req.body.title,
                releaseDate: req.body.releaseDate,
                genre: req.body.genre,
                actors: req.body.actors
            });

            await newMovie.save();
            res.status(201).json({ success: true, msg: "Movie saved successfully.", movie: newMovie });
        } catch (err) {
            if (err.code === 11000) { // Handles unique index violation for title
                return res.status(409).json({ success: false, msg: "A movie with that title already exists." });
            }
            res.status(500).json({ success: false, msg: 'Failed to save movie.', error: err.message });
        }
    })
    .all((req, res) => {
        res.status(405).send({ msg: 'HTTP method not supported for this endpoint.' });
    });

// Route for a single movie by title
router.route('/movies/:title')
    // GET a single movie
    .get(authJwtController.isAuthenticated, async (req, res) => {
        try {
            const movie = await Movie.findOne({ title: req.params.title });
            if (!movie) {
                return res.status(404).json({ success: false, msg: `Movie '${req.params.title}' not found.` });
            }
            res.status(200).json({ success: true, movie: movie });
        } catch (err) {
            res.status(500).json({ success: false, msg: 'An error occurred.', error: err.message });
        }
    })
    // PUT (update) a movie
    .put(authJwtController.isAuthenticated, async (req, res) => {
        try {
            const updatedMovie = await Movie.findOneAndUpdate(
                { title: req.params.title },
                req.body,
                { new: true } // Returns the updated document
            );

            if (!updatedMovie) {
                return res.status(404).json({ success: false, msg: "Movie not found." });
            }
            res.status(200).json({ success: true, msg: "Movie updated successfully.", movie: updatedMovie });
        } catch (err) {
            res.status(500).json({ success: false, msg: "Movie could not be updated.", error: err.message });
        }
    })
    // DELETE a movie
    .delete(authJwtController.isAuthenticated, async (req, res) => {
        try {
            const deletedMovie = await Movie.findOneAndDelete({ title: req.params.title });
            if (!deletedMovie) {
                return res.status(404).json({ success: false, msg: "Movie not found." });
            }
            res.status(200).json({ success: true, msg: `'${req.params.title}' deleted successfully.` });
        } catch (err) {
            res.status(500).json({ success: false, msg: 'Failed to delete movie.', error: err.message });
        }
    })
    .all((req, res) => {
        res.status(405).send({ msg: 'HTTP method not supported for this endpoint.' });
    });

// Route for Reviews
router.route('/reviews')
    // POST a new review for a movie
    .post(authJwtController.isAuthenticated, async (req, res) => {
        try {
            if (!req.body.movieId || !req.body.content || req.body.rating === undefined) {
                return res.status(400).json({ success: false, msg: "Please provide movieId, content, and rating." });
            }

            const movie = await Movie.findById(req.body.movieId);
            if (!movie) {
                return res.status(404).json({ success: false, msg: "Cannot post review: Movie not found." });
            }

            const token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.SECRET_KEY);

            const newReview = new Review({
                name: decoded.username,
                content: req.body.content,
                rating: req.body.rating,
                movieId: req.body.movieId
            });

            await newReview.save();
            res.status(201).json({ success: true, msg: "Review successfully saved!", review: newReview });

        } catch (err) {
            if (err.name === 'CastError') {
                return res.status(400).json({ success: false, msg: "Invalid movie ID format." });
            }
            res.status(500).json({ success: false, msg: 'Server error while saving review.', error: err.message });
        }
    })
    // GET all reviews (can be filtered by movie later if needed)
    .get(authJwtController.isAuthenticated, async (req, res) => {
        try {
            const reviews = await Review.find({});
            res.status(200).json({ success: true, reviews: reviews });
        } catch (err) {
            res.status(500).json({ success: false, msg: 'Failed to retrieve reviews.', error: err.message });
        }
    });

app.use('/', router);
app.listen(process.env.PORT || 8080);
module.exports = app; // for testing only
