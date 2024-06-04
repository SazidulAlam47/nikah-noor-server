import express from 'express';
import cors from 'cors';
import dotenv, { parse } from 'dotenv';
dotenv.config();
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());

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
        await client.connect();

        const database = client.db("nikahNoorDB");
        const biodataCollection = database.collection("biodatas");
        const favoriteCollection = database.collection("favorites");
        const userCollection = database.collection("users");

        // biodata collection
        app.get("/biodatas", async (req, res) => {
            const biodataType = req.query?.biodataType;
            const permanentDivision = req.query?.permanentDivision;
            const ageFrom = parseInt(req.query?.from);
            const ageTo = parseInt(req.query?.to);

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
            const result = await biodataCollection.find(query, options).toArray();
            res.send(result);
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

        app.get("/biodatas/:biodataId", async (req, res) => {
            const biodataId = parseInt(req.params.biodataId);
            const query = { biodataId: biodataId };
            const result = await biodataCollection.findOne(query);
            res.send(result);
        });

        app.get("/biodatas/email/:email", async (req, res) => {
            const email = req.params.email;
            const query = { contactEmail: email };
            const result = await biodataCollection.findOne(query);
            res.send(result);
        });

        app.get("/biodatasPremium", async (req, res) => {
            const query = { premium: "Pending" };
            const options = {
                projection: {
                    biodataId: 1,
                    _id: 0,
                    name: 1,
                    contactEmail: 1
                },
            };
            const result = await biodataCollection.find(query, options).toArray();
            res.send(result);
        });

        app.put("/biodatas/:email", async (req, res) => {
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

        // make user premium
        app.patch("/biodatas/:biodataId", async (req, res) => {
            const biodataId = parseInt(req.params.biodataId);
            const biodata = req.body;
            console.log(biodataId, biodata);
            const filter = { biodataId: biodataId };
            const UpdatedBiodata = {
                $set: {
                    premium: biodata.premium,
                }
            };
            const result = await biodataCollection.updateOne(filter, UpdatedBiodata);
            res.send(result);
        });

        // favorite collection
        app.post("/favorites", async (req, res) => {
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

        app.get("/favorites/email/:email", async (req, res) => {
            const email = req.params.email;

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

        app.delete("/favorites/:id", async (req, res) => {
            const id = parseInt(req.params.id);
            const query = { favoriteId: id };
            const result = await favoriteCollection.deleteOne(query);
            res.send(result);
        });

        // user collection
        app.get("/users",  async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        app.put("/users", async (req, res) => {
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



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
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