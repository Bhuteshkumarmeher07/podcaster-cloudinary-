const authMiddleware = require("../middleware/authMiddlware");
//const upload = require("../middleware/multer");
const Category = require("../models/category");
const User = require("../models/user");
const Podcast = require("../models/podcast");
const router = require("express").Router();
const cloudinary = require("../middleware/cloudinary");
const streamifier = require("streamifier");
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });

const streamUpload = (buffer, options) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (result) {
          resolve(result);
        } else {
          reject(error);
        }
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

router.post(
  "/add-podcast",
  authMiddleware,
  upload.fields([{ name: "frontImage" }, { name: "audioFile" }]),
  async (req, res) => {
    try {
      const { title, description, category } = req.body;
      if (
        !title ||
        !description ||
        !category ||
        !req.files["frontImage"] ||
        !req.files["audioFile"]
      ) {
        return res.status(400).json({ message: "All fields are required" });
      }

      const frontImageBuffer = req.files["frontImage"][0].buffer;
      const audioFileBuffer = req.files["audioFile"][0].buffer;

      const frontImageUpload = await streamUpload(frontImageBuffer, {
        resource_type: "image",
      });
      const audioFileUpload = await streamUpload(audioFileBuffer, {
        resource_type: "video",
      });

      const frontImage = frontImageUpload.secure_url;
      const audioFile = audioFileUpload.secure_url;

      const { user } = req;
      const cat = await Category.findOne({ categoryName: category });
      if (!cat) {
        return res.status(400).json({ message: "No category found" });
      }
      const catid = cat._id;
      const userid = user._id;

      const newPodcast = new Podcast({
        title,
        description,
        category: catid,
        frontImage,
        audioFile,
        user: userid,
      });

      await newPodcast.save();
      await Category.findByIdAndUpdate(catid, {
        $push: { podcasts: newPodcast._id },
      });
      await User.findByIdAndUpdate(userid, {
        $push: { podcasts: newPodcast._id },
      });

      res.status(201).json({ message: "Podcast added successfully" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Failed to add podcast" });
    }
  }
);

//get all podcast
router.get("/get-podcasts", async (req, res) => {
  try {
    const podcasts = await Podcast.find()
      .populate("category")
      .sort({ createdAt: -1 });
    return res.status(200).json({ data: podcasts });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
});

//get-user-podcasts
router.get("/get-user-podcasts", authMiddleware, async (req, res) => {
  try {
    const { user } = req;
    const userid = user._id;
    const data = await User.findById(userid)
      .populate({
        path: "podcasts",
        populate: { path: "category" },
      })
      .select("-password");
    if (data && data.podcasts) {
      data.podcasts.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
    }
    return res.status(200).json({ data: data.podcasts });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
});

//get podcast by id
router.get("/get-podcast/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const podcasts = await Podcast.findById(id).populate("category");
    return res.status(200).json({ data: podcasts });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
});

//get podcast by categories
router.get("/category/:cat", async (req, res) => {
  try {
    const { cat } = req.params;
    const categories = await Category.find({ categoryName: cat }).populate({
      path: "podcasts",
      populate: { path: "category" },
    });
    let podcasts = [];
    categories.forEach((category) => {
      podcasts = [...podcasts, ...category.podcasts];
    });
    return res.status(200).json({ data: podcasts });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
