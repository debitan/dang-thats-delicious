const mongoose = require('mongoose');

const Store = mongoose.model('Store');
const User = mongoose.model('User');

const choices = ['Wifi', 'Open Late', 'Family Friendly', 'Vegetarian', 'Licensed'];

const multer = require('multer');

const multerOptions = {
        storage: multer.memoryStorage(),
        fileFilter(req, file, next) {
                const isPhoto = file.mimetype.startsWith('image/');
                if (isPhoto) {
                        next(null, true);
                } else {
                        next({ message: "That file type isn't allowed!" }, false);
                }
        },
};

const jimp = require('jimp');
const uuid = require('uuid');

// functions used in controllers

const heartStrings = user => user.hearts.map(obj => obj.toString());
const redHeart = (userHearts, stores) => {
        stores.forEach(store => {
                userHearts.includes(store._id.toString()) ? (store.heart = 'red') : (store.heart = '');
        });
};
const StoreIsHearted = (userHearts, stores) => {
        const heartedStores = [];
        stores.forEach(store => {
                userHearts.includes(store._id.toString()) ? heartedStores.push(store) : null;
        });
        return heartedStores;
};
const makeHeartRed = stores => stores.forEach(store => (store.heart = 'red'));

// controllers

exports.homepage = (req, res) => {
        res.render('index');
};

exports.addStore = (req, res) => {
        res.render('editStore', { title: 'Add store', choices });
};

exports.upload = multer(multerOptions).single('photo');

exports.resize = async (req, res, next) => {
        // check if there is a new file to resize
        if (!req.file) {
                next();
                return;
        }
        const extension = req.file.mimetype.split('/')[1];
        req.body.photo = `${uuid.v4()}.${extension}`;
        // now we resize
        const photo = await jimp.read(req.file.buffer);
        await photo.resize(800, jimp.AUTO);
        await photo.write(`./public/uploads/${req.body.photo}`);
        // once we have written the file to our filesystem, keep going!
        next();
};

exports.createStore = async (req, res) => {
        req.body.author = req.user._id;
        const store = await new Store(req.body).save();
        req.flash('success', `Successfully created ${store.name}. Care to leave a review?`);
        res.redirect('/stores');
};

exports.getStores = async (req, res) => {
        const doesNotExist = () => {
                req.flash(
                        'info',
                        `Hey! You asked for page ${
                                req.params.page
                        }, but that doesn't exist. So we've put you on page 1. Hope that's ok...`
                );
                res.redirect('/stores/page/1');
        };

        let page = '';
        const pageCheck = () => {
                if (req.params.page < 1) {
                        doesNotExist();
                        return;
                }
                page = req.params.page || 1;
        };
        pageCheck();
        const limit = 6;
        const skip = page * limit - limit;
        const storesPromise = Store.find()
                .skip(skip)
                .limit(limit)
                .sort({ created: 'desc' });
        const countPromise = Store.count();
        const [stores, count] = await Promise.all([storesPromise, countPromise]);
        const pages = Math.ceil(count / limit);
        const userHearts = req.user ? heartStrings(req.user) : '';
        redHeart(userHearts, stores);

        if (!stores.length && skip) {
                doesNotExist();
                return;
        }

        res.render('stores', { title: 'Stores', stores, count, page, pages, userHearts });
};

const confirmOwner = (store, user) => {
        if (!store.author.equals(user._id)) {
                throw Error('You must own a store in order to edit it');
        }
};

exports.editStore = async (req, res) => {
        // find the store by ID
        const store = await Store.findOne({ _id: req.params.id });
        // check if user has permission
        confirmOwner(store, req.user);
        // render the edit store form
        res.render('editStore', { title: `Edit ${store.name}`, store, choices });
};

exports.updateStore = async (req, res) => {
        // set the location data to be a point
        req.body.location.type = 'Point';
        // fund and update store
        const store = await Store.findOneAndUpdate({ _id: req.params.id }, req.body, {
                new: true, // return the updated store
                runValidators: true, // require the required fields
        }).exec();
        // send an update success flash message
        req.flash(
                'success',
                `Successfully updated <strong>${store.name}</strong>. <a href="/stores/${store.slug}">View store →</a>`
        );
        // send the user back to the edit page they came from
        res.redirect(`/stores/${store._id}/edit`);
};

exports.getStoreBySlug = async (req, res, next) => {
        // find store by slug
        const store = await Store.findOne({ slug: req.params.slug }).populate('author reviews');
        if (!store) return next();
        res.render('store', { store, title: store.name });
};

exports.getStoresByTag = async (req, res) => {
        const { tag } = req.params;
        const tagQuery = tag || { $exists: true };
        const tagsPromise = Store.getTagsList();
        const storesPromise = Store.find({ tags: tagQuery });
        const [tags, stores] = await Promise.all([tagsPromise, storesPromise]);
        res.render('tag', { tags, stores, tag, title: 'Tags' });
};

exports.searchStores = async (req, res) => {
        const stores = await Store
                // first find stores that match
                .find(
                        {
                                $text: {
                                        $search: req.query.q,
                                },
                        },
                        {
                                // project a score field onto the objects (this is based on how many times the query appears within the object)
                                score: { $meta: 'textScore' },
                        }
                )
                // then sort them
                .sort({
                        score: { $meta: 'textScore' },
                })
                // limit to top 5
                .limit(5);
        res.json(stores);
};

exports.mapStores = async (req, res) => {
        const coordinates = [req.query.lng, req.query.lat].map(parseFloat);
        const q = {
                location: {
                        $near: {
                                $geometry: {
                                        type: 'Point',
                                        coordinates,
                                },
                                $maxDistance: 10000, // 10km
                        },
                },
        };

        const stores = await Store.find(q)
                .select('slug name description location photo')
                .limit(10);
        res.json(stores);
};

exports.mapPage = (req, res) => {
        res.render('map', { title: 'Map' });
};

exports.heartStore = async (req, res) => {
        const hearts = req.user.hearts.map(obj => obj.toString());
        const operator = hearts.includes(req.params.id) ? '$pull' : '$addToSet';
        const user = await User.findByIdAndUpdate(
                req.user._id,
                { [operator]: { hearts: req.params.id } },
                { new: true }
        );
        res.json(user);
};

exports.getHeartedStores = async (req, res) => {
        // TODO - there is a more performant way to do this using $in through mongoose, but this is the first solution I came up with and will do for now
        // get stores
        const allStores = await Store.find();
        // use userHearts to get listed of heartedStores
        const userHearts = heartStrings(req.user);
        // use new function to check if stores are in heartedStores
        const stores = StoreIsHearted(userHearts, allStores);
        // add store.heart = 'red' to all hearted stores
        makeHeartRed(stores);
        // pass stores which match to heartedStores through to the template
        res.render('stores', { title: 'Hearted stores', stores });
};

exports.getTopStores = async (req, res) => {
        const stores = await Store.getTopStores();
        res.render('topStores', { stores, title: '★ Top 10 Stores' });
};
