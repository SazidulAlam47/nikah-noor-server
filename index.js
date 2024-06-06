import express from 'express';
import cors from 'cors';
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import dotenv from 'dotenv';
dotenv.config();
// stripe
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
// mongodb
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb';
const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(cors({
    origin: [
        // "http://localhost:5173", // TODO: add production url
        "https://nikah-noor-client.vercel.app"
    ],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xyqwep0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server (optional starting in v4.7)
        // await client.connect(); // TODO: disable on production

        const database = client.db("nikahNoorDB");
        const biodataCollection = database.collection("biodatas");
        const favoriteCollection = database.collection("favorites");
        const userCollection = database.collection("users");
        const reviewCollection = database.collection("reviews");
        const paymentCollection = database.collection("payments");

        // my middlewares
        const verifyToken = async (req, res, next) => {
            const token = req.cookies?.token;
            console.log('Verifying token', token);
            if (!token) {
                return res.status(401).send({ message: 'Not authorized' });
            }
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    console.log(err);
                    return res.status(401).send({ message: 'Not authorized' });
                }
                req.user = decoded;
                console.log(decoded);
                next();
            })

        };

        // admin check middleware
        const verifyAdmin = async (req, res, next) => {
            const email = req.user?.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === "admin";
            console.log({ isAdmin: isAdmin });
            console.log("check email", email);
            if (!isAdmin) {
                return res.status(403).send({ message: 'Forbidden' });
            }
            next();
        };

        //jwt auth
        app.post("/jwt", async (req, res) => {
            const user = req.body;
            console.log(user);
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10h' });
            res
                .cookie("token", token, {
                    httpOnly: true,
                    secure: true, // TODO: "true" on production
                    sameSite: "none", // TODO: uncomment on production
                })
                .send({ success: true });
        });

        app.get("/logout", async (req, res) => {
            res.clearCookie("token")
                .send({ success: true });
        });

        // biodata collection
        app.get("/biodatas", async (req, res) => {
            const biodataType = req.query?.biodataType;
            const permanentDivision = req.query?.permanentDivision;
            const ageFrom = parseInt(req.query?.from);
            const ageTo = parseInt(req.query?.to);

            const page = parseInt(req.query?.page);
            const size = parseInt(req.query?.size);

            const query = {};
            if (biodataType) query.biodataType = biodataType;
            if (permanentDivision) query.permanentDivision = permanentDivision;
            if (ageFrom && ageTo) query.age = { $gte: ageFrom, $lte: ageTo };

            const options = {
                projection: {
                    biodataId: 1,
                    _id: 0,
                    name: 1,
                    biodataType: 1,
                    profileImage: 1,
                    age: 1,
                    occupation: 1,
                    permanentDivision: 1
                },
            };
            const result = await biodataCollection.find(query, options).skip(page * size).limit(size).toArray();
            res.send(result);
        });

        app.get("/biodatasCount", async (req, res) => {
            const biodataType = req.query?.biodataType;
            const permanentDivision = req.query?.permanentDivision;
            const ageFrom = parseInt(req.query?.from);
            const ageTo = parseInt(req.query?.to);

            const query = {};
            if (biodataType) query.biodataType = biodataType;
            if (permanentDivision) query.permanentDivision = permanentDivision;
            if (ageFrom && ageTo) query.age = { $gte: ageFrom, $lte: ageTo };

            const count = await biodataCollection.countDocuments(query);
            res.send({ count });
        });

        app.get("/biodatasSidebar", async (req, res) => {
            const type = req.query.type;
            const count = parseInt(req.query.count);
            const biodataIdToSkip = parseInt(req.query.skip);
            const result = await biodataCollection.aggregate([
                {
                    $match: {
                        biodataType: type,
                        biodataId: { $ne: biodataIdToSkip }
                    }
                },
                {
                    $sample: {
                        size: count
                    }
                },
                {
                    $project: {
                        biodataId: 1,
                        _id: 0,
                        name: 1,
                        biodataType: 1,
                        profileImage: 1,
                        age: 1,
                        occupation: 1,
                        permanentDivision: 1
                    }
                }
            ]).toArray();
            res.send(result);
        });

        app.get("/biodatas/:biodataId", verifyToken, async (req, res) => {
            const biodataId = parseInt(req.params.biodataId);
            const email = req.user?.email;
            const query = { biodataId: biodataId };
            const result = await biodataCollection.findOne(query);
            // check user admin or premium or self
            // if not don't send email and phone number
            const user = await userCollection.findOne({ email: email });
            if (!(user?.role === 'admin' || user?.premium === 'Approved' || result.contactEmail === email)) {
                result.contactEmail = "";
                result.mobileNumber = "";
            }
            res.send(result);
        });

        // for getting self biodata
        app.get("/biodatas/email/:email", verifyToken, async (req, res) => {
            const email = req.params.email;
            if (req.user.email !== email) {
                return res.status(403).send({ message: 'Forbidden access' });
            }
            const query = { contactEmail: email };
            const result = await biodataCollection.findOne(query);
            res.send(result);
        });

        app.put("/biodatas/:email", verifyToken, async (req, res) => {
            const email = req.params.email;
            const biodata = req.body;
            console.log({ email, biodata });

            // check if the user is already have biodata
            const UserQuery = { contactEmail: email };
            const userOptions = {
                projection: { biodataId: 1, _id: 0 },
            };
            const userBioIdObj = await biodataCollection.findOne(UserQuery, userOptions);
            let userBiodataId = userBioIdObj?.biodataId;

            // if user don't have biodata then give him new biodataId
            if (!userBiodataId) {
                const lastQuery = {};
                const lastOptions = {
                    projection: { biodataId: 1, _id: 0 },
                };
                const lastIdObj = await biodataCollection.find(lastQuery, lastOptions).sort({ biodataId: -1 }).limit(1).toArray();
                userBiodataId = lastIdObj[0].biodataId + 1;
            }

            // update biodata
            const filter = { contactEmail: email };
            const options = { upsert: true };
            const UpdatedBiodata = {
                $set: {
                    biodataId: userBiodataId,
                    biodataType: biodata.biodataType,
                    name: biodata.name,
                    profileImage: biodata.profileImage,
                    dateOfBirth: biodata.dateOfBirth,
                    height: biodata.height,
                    weight: biodata.weight,
                    age: biodata.age,
                    occupation: biodata.occupation,
                    race: biodata.race,
                    fathersName: biodata.fathersName,
                    mothersName: biodata.mothersName,
                    permanentDivision: biodata.permanentDivision,
                    presentDivision: biodata.presentDivision,
                    expectedPartnerAge: biodata.expectedPartnerAge,
                    expectedPartnerHeight: biodata.expectedPartnerHeight,
                    expectedPartnerWeight: biodata.expectedPartnerWeight,
                    contactEmail: biodata.contactEmail,
                    mobileNumber: biodata.mobileNumber,
                }
            };
            const result = await biodataCollection.updateOne(filter, UpdatedBiodata, options);
            res.send(result);
        });

        // favorite collection
        app.post("/favorites", verifyToken, async (req, res) => {
            const favorite = req.body;
            const newFavoriteId = favorite.favoriteId;

            //check already exists in the favorites
            const query = { email: favorite.email };
            const options = {
                projection: { favoriteId: 1, _id: 0 },
            };
            const userFavoritesObj = await favoriteCollection.find(query, options).toArray();
            const userOldFavoritesArray = userFavoritesObj.map(obj => obj.favoriteId);

            if (userOldFavoritesArray.indexOf(newFavoriteId) !== -1) {
                return res.send({ exists: true });
            }

            // add to favorites
            const result = await favoriteCollection.insertOne(favorite);
            res.send(result);
        });

        app.get("/favorites/email/:email", verifyToken, async (req, res) => {
            const email = req.params.email;
            if (req.user.email !== email) {
                return res.status(403).send({ message: 'Forbidden access' });
            }

            const result = await favoriteCollection.aggregate([
                {
                    $match: { email: email }
                },
                {
                    $project: { favoriteId: 1, _id: 0 }
                },
                {
                    $lookup: {
                        from: "biodatas",
                        localField: "favoriteId",
                        foreignField: "biodataId",
                        as: "biodata"
                    }
                },
                {
                    $unwind: {
                        path: "$biodata",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $project: {
                        biodataId: "$biodata.biodataId",
                        name: "$biodata.name",
                        permanentDivision: "$biodata.permanentDivision",
                        occupation: "$biodata.occupation",
                    }
                }
            ]).toArray();

            res.send(result);
        });

        app.delete("/favorites/:id", verifyToken, async (req, res) => {
            const id = parseInt(req.params.id);
            const query = { favoriteId: id };
            const result = await favoriteCollection.deleteOne(query);
            res.send(result);
        });

        // user collection
        app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        app.put("/users", verifyToken, async (req, res) => {
            const user = req.body;
            console.log(user);
            const filter = { email: user.email };
            const options = { upsert: true };
            const UpdatedUser = {
                $set: {
                    name: user.name,
                    email: user.email,
                }
            };
            const result = await userCollection.updateOne(filter, UpdatedUser, options);
            res.send(result);
        });

        // check user admin
        app.get("/users/admin/:email", verifyToken, async (req, res) => {
            const email = req.params.email;
            if (req.user?.email !== email) {
                return res.status(403).send({ message: 'Forbidden' });
            }
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const admin = user?.role === "admin";

            res.send({ admin });
        });

        // check user premium
        app.get("/users/premium/:email", verifyToken, async (req, res) => {
            const email = req.params.email;
            if (req.user?.email !== email) {
                return res.status(403).send({ message: 'Forbidden' });
            }
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const premium = user?.premium === "Approved";

            res.send({ premium });
        });

        // make user premium request
        app.get("/users/premiumReq/:email", verifyToken, async (req, res) => {
            const email = req.params.email;
            const biodata = req.body;
            console.log(email, biodata);
            const filter = { email: email };
            const UpdatedBiodata = {
                $set: {
                    premium: "Pending",
                }
            };
            const result = await userCollection.updateOne(filter, UpdatedBiodata);
            res.send(result);
        });

        // make user premium
        app.get("/users/makePremium/:email", verifyToken, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const biodata = req.body;
            console.log(email, biodata);
            const filter = { email: email };
            const UpdatedBiodata = {
                $set: {
                    premium: "Approved",
                }
            };
            const result = await userCollection.updateOne(filter, UpdatedBiodata);
            res.send(result);
        });

        // make user admin
        app.patch("/users/admin", verifyToken, verifyAdmin, async (req, res) => {
            const user = req.body;
            console.log(user);
            const filter = { email: user.email };
            const UpdatedUser = {
                $set: {
                    role: "admin",
                }
            };
            const result = await userCollection.updateOne(filter, UpdatedUser);
            res.send(result);
        });

        // update user name
        app.patch("/users", verifyToken, async (req, res) => {
            const user = req.body;
            console.log(user);
            const filter = { email: user.email };
            const UpdatedUser = {
                $set: {
                    name: user.name,
                }
            };
            const result = await userCollection.updateOne(filter, UpdatedUser);
            res.send(result);
        });

        // get 6 random premium users
        app.get("/premiums", async (req, res) => {
            const count = parseInt(req.query.count);

            const result = await userCollection.aggregate([
                {
                    $match: {
                        premium: "Approved"
                    }
                },
                {
                    $lookup: {
                        from: "biodatas",
                        localField: "email",
                        foreignField: "contactEmail",
                        as: "biodata"
                    }
                },
                {
                    $unwind: "$biodata"
                },
                {
                    $project: {
                        _id: 0,
                        profileImage: "$biodata.profileImage",
                        biodataId: "$biodata.biodataId",
                        biodataType: "$biodata.biodataType",
                        age: "$biodata.age",
                        occupation: "$biodata.occupation",
                        permanentDivision: "$biodata.permanentDivision",
                    }
                },
                {
                    $sample: {
                        size: count
                    }
                },
            ]).toArray();

            res.send(result);
        });

        app.post("/payments", verifyToken, async (req, res) => {
            const payment = req.body;
            console.log(payment);
            const result = await paymentCollection.insertOne(payment);
            res.send(result);
        });

        app.get("/payments/user", verifyToken, async (req, res) => {
            const email = req.user?.email;
            const response = await paymentCollection.aggregate([
                {
                    $match: {
                        email: email
                    }
                },
                {
                    $lookup: {
                        from: "biodatas",
                        localField: "contactRequestId",
                        foreignField: "biodataId",
                        as: "biodata"
                    }
                },
                {
                    $unwind: "$biodata"
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "email",
                        foreignField: "email",
                        as: "user"
                    }
                },
                {
                    $unwind: "$user"
                },
                {
                    $project: {
                        status: "$status",
                        requestedId: "$contactRequestId",
                        requestedName: "$biodata.name",
                        requestedEmail: "$biodata.contactEmail",
                        requestedMobileNumber: "$biodata.mobileNumber",
                    }
                }
            ]).toArray();

            const result = response.map(req => {
                if (req?.status !== 'Approved') {
                    req.requestedEmail = "";
                    req.requestedMobileNumber = "";
                }

                return req;
            })

            res.send(result);
        });

        app.get("/payments/admin", verifyToken, verifyAdmin, async (req, res) => {
            const result = await paymentCollection.aggregate([
                {
                    $match: {
                        status: "Pending"
                    }
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "email",
                        foreignField: "email",
                        as: "user"
                    }
                },
                {
                    $unwind: "$user"
                },
                {
                    $project: {
                        userName: "$user.name",
                        userEmail: "$email",
                        requestedId: "$contactRequestId",
                    }
                }
            ]).toArray();

            res.send(result);
        });

        app.get("/payments/exist/:biodataId", verifyToken, async (req, res) => {
            const biodataId = parseInt(req.params.biodataId);
            const email = req.user?.email;
            const query = { email: email };

            const response = await paymentCollection.find(query).toArray();
            const reqIds = response?.map(req => req.contactRequestId);

            const exist = reqIds.includes(biodataId);

            res.send({ exist });
        });

        // approve request
        app.get("/payments/approve/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            console.log(id, payment);
            const filter = { _id: new ObjectId(id) };
            const UpdatedPayment = {
                $set: {
                    status: "Approved",
                }
            };
            const result = await paymentCollection.updateOne(filter, UpdatedPayment);
            res.send(result);
        });

        app.delete("/payments/:id", verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await paymentCollection.deleteOne(query);
            res.send(result);
        });

        // review collection
        app.get("/reviews", async (req, res) => {
            const result = await reviewCollection.find().toArray();
            res.send(result);
        });

        app.post("/reviews", verifyToken, async (req, res) => {
            const review = req.body;
            console.log(review);
            const result = await reviewCollection.insertOne(review);
            res.send(result);
        });

        app.get("/public-stats", async (req, res) => {
            const totalBiodata = await biodataCollection.estimatedDocumentCount();
            const maleBiodata = await biodataCollection.countDocuments({ biodataType: "Male" });
            const femaleBiodata = await biodataCollection.countDocuments({ biodataType: "Female" });
            const totalReview = await reviewCollection.estimatedDocumentCount();
            res.send({ totalBiodata, maleBiodata, femaleBiodata, totalReview });
        });

        app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
            const totalBiodata = await biodataCollection.estimatedDocumentCount();
            const maleBiodata = await biodataCollection.countDocuments({ biodataType: "Male" });
            const femaleBiodata = await biodataCollection.countDocuments({ biodataType: "Female" });
            const premiumBiodata = await userCollection.countDocuments({ premium: "Approved" });
            const totalReview = await reviewCollection.estimatedDocumentCount();
            const totalRevenueArry = await paymentCollection.find({}, {
                projection: {
                    price: 1,
                    _id: 0
                }
            }).toArray();
            const totalRevenue = totalRevenueArry.reduce((acc, curr) => acc + curr.price, 0);

            res.send({ totalBiodata, maleBiodata, femaleBiodata, premiumBiodata, totalReview, totalRevenue });
        });


        // payment intent
        app.post("/create-payment-intent", verifyToken, async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            console.log({ amount });
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        // check premium pending requests
        app.get("/usersPremium", verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.aggregate([
                {
                    $match: {
                        premium: "Pending"
                    }
                },
                {
                    $lookup: {
                        from: "biodatas",
                        localField: "email",
                        foreignField: "contactEmail",
                        as: "biodata"
                    }
                },
                {
                    $unwind: "$biodata"
                },
                {
                    $project: {
                        _id: 0,
                        biodataId: "$biodata.biodataId",
                        name: "$name",
                        email: "$email",
                    }
                }
            ]).toArray();

            res.send(result);
        });



        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 }); // TODO: disable on production
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Nikah Noor server is running');
});

app.listen(port, () => {
    console.log(`Nikah Noor server is running on port ${port}`);
});