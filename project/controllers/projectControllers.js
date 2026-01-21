const { StatusCodes } = require('http-status-codes');
const mongoose = require("mongoose");
// const User = require('../models/user');
// const schedule = require('node-schedule');
const Project = require('../models/project');
const { sendKafkaMessage } = require("../config/utils/sendKafkaMessage");
const { fetchNativeUserData, fetchUserData, fetchMacbeaseContent } = require('./utilControllers');
// const MacbeaseContent = require('../models/macbeaseContent');
// const { pingUsers, allotProjectChatroom, scheduleNotification2 } = require('./utils');

// Controller 1
const createProject = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("Not authorized to access this route.");
    }

    const { title, description, responseClosedAt, universeMetaData } = req.body;

    if (!title || !description || !responseClosedAt || !universeMetaData) {
      return res.status(400).json({
        message: "Incomplete fields.",
      });
    }

    const newProject = new Project({
      createdBy: req.user.id,
      title,
      description,
      responseClosedAt,
      uid: req.user.uid,
      universeMetaData
    });

    const savedProject = await newProject.save();

    await sendKafkaMessage("CREATE_PROJECT", "universe", {
      projectId: savedProject._id.toString(),
      title: savedProject.title,
    });

    return res.status(201).json({
      message: "Project created successfully.",
      project: savedProject,
    });
  } catch (error) {
    console.error("Error creating project:", error);
    return res.status(500).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// Controller 2
const addInterestedUser = async (req, res) => {
  try {
    if (req.user.role !== "user") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("Not authorized to access this route.");
    }

    const { id: userId, callSign } = req.user;
    const { projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({
        message: "Project ID is required.",
      });
    }

    const user_query = {
      id: userId,
      fields: ["role"],
      callSign,
    };

    const user = await fetchNativeUserData(user_query);

    if (!user || user.role !== "Creator") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("Only content creators can access this route.");
    }

    const project = await Project.findById(projectId, { state: 1 });

    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    if (project.state !== 0) {
      return res.status(400).json({
        message:
          "Cannot express interest. The project is not in a valid state.",
      });
    }

    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      { $addToSet: { interested: userId } },
      { new: true }
    );

    return res.status(200).json({
      message: "User added to the interested list successfully.",
      project: updatedProject,
    });
  } catch (error) {
    console.error("Error adding user to interested list:", error);
    return res.status(500).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// Controller 3
const removeUserFromInterested = async (req, res) => {
  try {
    const { projectId } = req.body;
    const userId = req.user.id;

    if (!projectId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Project ID is required." });
    }

    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      { $pull: { interested: userId } },
      { new: true }
    );

    if (!updatedProject) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Project not found." });
    }

    return res.status(StatusCodes.OK).json({
      message: "User successfully removed from the interested list.",
      project: updatedProject,
    });
  } catch (error) {
    console.error("Error removing user from interested list:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// Controller 4
const updateProjectState = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("Not authorized to access this route.");
    }

    const { state, projectId } = req.body;
    const validStates = [0, 1, 2];

    if (!validStates.includes(state)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message:
          "Invalid state. Valid states are 0 (NEW), 1 (IN_PROGRESS), or 2 (COMPLETED).",
      });
    }

    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      { state },
      { new: true }
    );

    if (!updatedProject) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Project not found." });
    }

    return res.status(StatusCodes.OK).json({
      message: "Project state updated successfully.",
      project: updatedProject,
    });
  } catch (error) {
    console.error("Error updating project state:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// Controller 5
const allotUsersToProject = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: "You are not authorized to access this route." });
    }

    const { userIds, projectId } = req.body;

    if (
      typeof projectId !== "string" ||
      projectId.trim() === "" ||
      !Array.isArray(userIds) ||
      userIds.length === 0 ||
      !userIds.every(id => typeof id === "string" && id.trim() !== "")
    ) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "A valid 'projectId' and a non-empty array of user IDs (strings) are required.",
      });
    }

    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      { $addToSet: { allotedTo: { $each: userIds } }, state: 1 },
      { new: true }
    );

    if (!updatedProject) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: "Project not found." });
    }

    try {
      await sendKafkaMessage("ALLOT_USERS_TO_PROJECT", "universe", {
        projectId: updatedProject._id.toString(),
        userIds,
        title: updatedProject.title,
      });
    } catch (kafkaError) {
      console.error("Kafka message failed:", kafkaError);
    }

    return res.status(StatusCodes.OK).json({
      message: "Users successfully allotted to the project.",
      project: updatedProject,
    });
  } catch (error) {
    console.error("Error allotting users to project:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// Controller 6
const submitProjectReview = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: "You are not authorized to access this route." });
    }

    const { projectId, review } = req.body;
    const userId = req.user.id;

    if (
      typeof review !== "string" ||
      review.trim() === ""
    ) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Review content is required." });
    }

    const project = await Project.findById(projectId, {
      createdBy: 1,
      review: 1,
      state: 1,
    });

    if (!project) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Project not found." });
    }

    if (project.createdBy.toString() !== userId) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: "You are not authorized to review this project." });
    }

    project.review = review.trim();
    project.state = 2;

    const updatedProject = await project.save();

    return res.status(StatusCodes.OK).json({
      message: "Review submitted successfully.",
      project: updatedProject,
    });

  } catch (error) {
    console.error("Error submitting project review:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// Controller 7
const getOpenProjects = async (req, res) => {
  try {
    const projects = await Project.find({ state: 0 });

    return res.status(StatusCodes.OK).json({
      message: projects.length
        ? "Open projects retrieved successfully."
        : "No open projects found.",
      projects,
    });
  } catch (error) {
    console.error("Error fetching open projects:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// Controller 8
const getInterestedCreators = async (req, res) => {
  try {
    const { projectId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Invalid project ID.",
      });
    }

    const project = await Project.findById(projectId).select("interested");

    if (!project) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Project not found.",
      });
    }

    const userIds = project.interested.map((id) => id.toString());

    const interested = await Promise.all(
      userIds.map(async (userId) => {
        try {
          return await fetchUserData({
            id: userId,
            fields: ["name", "image", "pushToken", "_id"]
          });
        } catch (err) {
          console.warn(`Failed to fetch user ${userId}:`, err.message);
          return null;
        }
      })
    );

    // Filter out null responses
    const filteredInterested = interested.filter(Boolean);

    return res.status(StatusCodes.OK).json(filteredInterested);
  } catch (error) {
    console.error("Error fetching interested creators:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// Controller 9
const getAllotedCreators = async (req, res) => {
  try {
    const { projectId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Invalid project ID.",
      });
    }

    const project = await Project.findById(projectId).select("allotedTo");

    if (!project) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Project not found.",
      });
    }

    const userIds = project.allotedTo.map((id) => id.toString());

    const allotedTo = await Promise.all(
      userIds.map(async (userId) => {
        try {
          return await fetchUserData({
            id: userId,
            fields: ["name", "image", "pushToken", "_id"]
          });
        } catch (err) {
          console.warn(`Failed to fetch user ${userId}:`, err.message);
          return null;
        }
      })
    );

    const filteredAllotedTo = allotedTo.filter(Boolean);

    return res.status(StatusCodes.OK).json(filteredAllotedTo);
  } catch (error) {
    console.error("Error fetching alloted creators", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// Controller 10
const getAllotedProjects = async (req, res) => {
  try {
    const projects = await Project.find({ state: 1 });

    return res.status(StatusCodes.OK).json({
      message: projects.length
        ? "Projects with state 1 retrieved successfully."
        : "Projects with state 1 is currently empty.",
      projects,
    });
  } catch (error) {
    console.error("Error fetching projects with state 1:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// Controller 11
const reviewProject = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Not authorized to access this route.' });
    }
    const { projectId, review } = req.body;
    if (!projectId || !review) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Project ID and review are required.' });
    }
    const project = await Project.findByIdAndUpdate(
      projectId,
      { review, state: 2 },
      { new: true }
    );
    if (!project) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: 'Project not found.' });
    }
    return res
      .status(StatusCodes.OK)
      .json({ message: 'Project reviewed successfully.', project });
  } catch (error) {
    console.error('Error reviewing project:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error: error.message });
  }
};

// Controller 12
const fetchProjectsBatch = async (req, res) => {
  try {
    const { batchSize, batch } = req.query;

    const size = parseInt(batchSize, 10);
    const batchNumber = parseInt(batch, 10);

    if (isNaN(size) || isNaN(batchNumber) || size <= 0 || batchNumber < 1) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Invalid batchSize or batch number. batch must be >= 1.",
      });
    }

    const skip = (batchNumber - 1) * size;

    const projects = await Project.find().skip(skip).limit(size);

    return res.status(StatusCodes.OK).json({
      message: projects.length
        ? "Projects batch retrieved successfully."
        : "No projects found for the requested batch.",
      batch: batchNumber,
      batchSize: size,
      projects,
    });
  } catch (error) {
    console.error("Error fetching projects batch:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// Controller 13
const getProjectsAllotedToUser = async (req, res) => {
  try {
    const userId = req.user.id;

    const projects = await Project.find({ allotedTo: userId });

    return res.status(StatusCodes.OK).json({
      message: projects.length
        ? "Projects fetched successfully."
        : "No projects found where you are alloted.",
      projects,
    });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// Controller 14
const getProjectContents = async (req, res) => {
  try {
    const { projectId } = req.query;

    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Valid project ID is required.",
      });
    }

    const project = await Project.findById(projectId, { media: 1 });

    if (!project) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Project not found.",
      });
    }

    if (!Array.isArray(project.media) || project.media.length === 0) {
      return res.status(StatusCodes.OK).json({
        message: "No media contents associated with this project.",
        contents: [],
      });
    }

    const contents = await fetchMacbeaseContent({
      ids: project.media,
      callSign: "macbeaseContent",
    });

    return res.status(StatusCodes.OK).json({
      message: "Contents fetched successfully.",
      contents,
    });
  } catch (error) {
    console.error("Error fetching project contents:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// Controller 15
const fetchProjectById = async (req, res) => {
  const { id } = req.query;

  try {
    const project = await Project.findById(id);

    if (!project) {
      return res.status(StatusCodes.BAD_REQUEST).send("Project not found.");
    }

    return res.status(StatusCodes.OK).send(project);
  } catch (err) {
    console.log("Error fetching project:", err);
    return res.status(StatusCodes.BAD_REQUEST).send("Something went wrong.");
  }
}

// Controller 16
const newProjectChatMessage = async (req, res) => {
  try {
    const { projectId, message, sender } = req.body;

    const project = await Project.findById(projectId, { allotedTo: 1, title: 1 });

    if (!project) {
      console.log("Project not found");
      return res.status(StatusCodes.NOT_FOUND).send("Project not found.");
    }

    const userIds = project.allotedTo.filter((item) => item.toString() !== req.user.id);

    if (userIds.length === 0) {
      console.log("No users");
      return res.status(StatusCodes.OK).send("No recipients to notify.");
    }

    await sendKafkaMessage("PROJECT_CHAT_MESSAGE", req.user.callSign, {
      projectId,
      userIds,
      title: project.title,
      message,
      sender
    })

    return res.status(StatusCodes.OK).send("Success");
  } catch (err) {
    console.log(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Something went wrong.");
  }
}

// Controller 17
const allotChatroom = async (req, res) => {
  const { id } = req.query;

  try {

    const project = await Project.findById(id, { allotedTo: 1 });

    const userIds = project.allotedTo;

    const chatDoc = {
      doc_id: `project${id}`,
      state: "unread",
    }

    await sendKafkaMessage("ALLOT_CHATROOM", req.user.callSign, {
      chatDoc,
      userIds
    })

    console.log("Successfully added chatRoom.");
    return res.status(StatusCodes.OK).send("Successful");
  } catch (error) {
    console.log("Error while alloting chatroom to users:", error);
    return res.status(StatusCodes.BAD_REQUEST).send("Something went wrong.");
  }
}

// Controller 18
const insertNewFields = async (req, res) => {
  try {
    const allProjects = await Project.find({});

    const bulkOps = allProjects.map((project) => ({
      updateOne: {
        filter: { _id: project._id },
        update: {
          $set: {
            uid: "696f491a0bfc89b35dc62326",
            universeMetaData: {
              location: "Punjab, India",
              logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
              logoKey: "public/universes/lpu_logo-removebg-preview.png",
              name: "Lovely Professional University",
              callSign: "LPU",
              lat: 31.25361,
              lng: 75.70361
            },
          },
        },
      }
    }));

    const result = await Project.bulkWrite(bulkOps);
    console.log(`Updated ${result.modifiedCount} Projects`);

    res.status(StatusCodes.OK).json({
      message: "Projects updated successfully.",
      modifiedCount: result.modifiedCount
    });
  } catch (err) {
    console.log("Error updating Projects:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" });
  }
}

module.exports = {
  createProject,
  addInterestedUser,
  removeUserFromInterested,
  updateProjectState,
  allotUsersToProject,
  submitProjectReview,
  getOpenProjects,
  getInterestedCreators,
  getAllotedCreators,
  getAllotedProjects,
  reviewProject,
  fetchProjectsBatch,
  getProjectsAllotedToUser,
  getProjectContents,
  allotChatroom,
  fetchProjectById,
  newProjectChatMessage,
  insertNewFields
};
