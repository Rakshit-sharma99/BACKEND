const { StatusCodes } = require('http-status-codes');
const User = require('../models/user');
const schedule = require('node-schedule');
const Project = require('../models/project');
const MacbeaseContent = require('../models/macbeaseContent');
const { pingUsers, allotProjectChatroom, scheduleNotification2 } = require('./utils');

const createProject = async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const { title, description, responseClosedAt } = req.body;
      if (!title || !description || !responseClosedAt) {
        return res.status(400).json({
          message: 'Title, description, and responseClosedAt are required.',
        });
      }
      const newProject = new Project({
        createdBy: req.user.id,
        title,
        description,
        responseClosedAt,
      });
      const savedProject = await newProject.save();
      const scheduleTime = new Date(Date.now() + 3000);
      schedule.scheduleJob(
        `projectCreated_${newProject._id}`,
        scheduleTime,
        async () => {
          const notification = {
            title: '🚀 New Project Alert!',
            body: `Great news! A new project titled "${newProject.title}" is live. Don't miss this opportunity—apply now before the deadline!`,
            img1: 'public/Macbease/Macbease-01.png',
            img2: '',
            key: 'read',
            url: 'https://macbease.com/app/projects',
          };
          const email = {
            name: 'Content Creator',
            intro: `We are thrilled to announce that a new project titled "${newProject.title}" is now live!`,
            outro:
              'Visit the link above to view the project details and get started:',
            subject: '✨ A New Project Awaits You!',
            action: {
              instructions: 'Click on the button below to go to the project:',
              text: 'View Project',
              url: 'https://macbease.com/app/projects',
            },
          };
          await pingUsers({
            role: 'Creator',
            pingLevel: 2,
            notification,
            email,
          });
        }
      );
      return res.status(201).json({
        message: 'Project created successfully.',
        project: savedProject,
      });
    } else {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send('Not authorized to access this route.');
    }
  } catch (error) {
    console.error('Error creating project:', error);
    return res
      .status(500)
      .json({ message: 'Internal server error.', error: error.message });
  }
};

const addInterestedUser = async (req, res) => {
  try {
    if (req.user.role === 'user') {
      const { id: userId } = req.user;
      const { projectId } = req.body;
      if (!userId || !projectId) {
        return res
          .status(400)
          .json({ message: 'User ID and Project ID are required.' });
      }
      const user = await User.findById(userId, { role: 1 });
      if (user.role !== 'Creator') {
        return res
          .status(StatusCodes.MISDIRECTED_REQUEST)
          .send('Only content creators can access this route.');
      }
      const project = await Project.findById(projectId, { state: 1 });
      if (!project) {
        return res.status(404).json({ message: 'Project not found.' });
      }
      if (project.state !== 0) {
        return res.status(400).json({
          message:
            'Cannot express interest. The project is not in a valid state.',
        });
      }
      const updatedProject = await Project.findByIdAndUpdate(
        projectId,
        { $addToSet: { interested: userId } },
        { new: true }
      );
      return res.status(200).json({
        message: 'User added to the interested list successfully.',
        project: updatedProject,
      });
    } else {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send('Not authorized to access this route.');
    }
  } catch (error) {
    console.error('Error adding user to interested list:', error);
    return res
      .status(500)
      .json({ message: 'Internal server error.', error: error.message });
  }
};

const removeUserFromInterested = async (req, res) => {
  try {
    const { projectId } = req.body;
    const userId = req.user.id;
    if (!projectId) {
      return res.status(400).json({ message: 'Project ID is required.' });
    }
    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      { $pull: { interested: userId } },
      { new: true }
    );
    if (!updatedProject) {
      return res.status(404).json({ message: 'Project not found.' });
    }
    return res.status(200).json({
      message: 'User successfully removed from the interested list.',
      project: updatedProject,
    });
  } catch (error) {
    console.error('Error removing user from interested list:', error);
    return res
      .status(500)
      .json({ message: 'Internal server error.', error: error.message });
  }
};

const updateProjectState = async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const { state, projectId } = req.body;
      const validStates = [0, 1, 2];
      if (!validStates.includes(state)) {
        return res.status(400).json({
          message:
            'Invalid state. Valid states are 0 (NEW), 1 (IN_PROGRESS), or 2 (COMPLETED).',
        });
      }
      const updatedProject = await Project.findByIdAndUpdate(
        projectId,
        { state },
        { new: true }
      );
      if (!updatedProject) {
        return res.status(404).json({ message: 'Project not found.' });
      }
      return res.status(200).json({
        message: 'Project state updated successfully.',
        project: updatedProject,
      });
    } else {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send('Not authorized to access this route.');
    }
  } catch (error) {
    console.error('Error updating project state:', error);
    return res
      .status(500)
      .json({ message: 'Internal server error.', error: error.message });
  }
};

const allotUsersToProject = async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const { userIds, projectId } = req.body;
      if (!projectId || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          message: 'Project ID and a non-empty array of user IDs are required.',
        });
      }
      const updatedProject = await Project.findByIdAndUpdate(
        projectId,
        { $addToSet: { allotedTo: { $each: userIds } }, state: 1 },
        { new: true }
      );
      if (!updatedProject) {
        return res.status(404).json({ message: 'Project not found.' });
      }
      const scheduleTime = new Date(Date.now() + 3000);
      schedule.scheduleJob(
        `projectAlloted_${updatedProject._id}`,
        scheduleTime,
        async () => {
          const notification = {
            title: '🎉 Congratulations! Project Allotted!',
            body: `You’ve been selected as part of the team for the project "${updatedProject.title}". Check it out now!`,
            img1: 'public/Macbease/Macbease-01.png',
            img2: '',
            key: 'read',
            url: 'https://macbease.com/app/projects',
          };

          const email = {
            name: 'Dear Content Creator',
            intro: `We are thrilled to inform you that you have been selected as part of the team for the project **"${updatedProject.title}"**!`,
            body: `To streamline communication, a group chat for this project has been created and added to your chatrooms. Please ensure you check your messages regularly for updates and collaboration details. Additionally, further instructions have been sent to your email.`,
            outro: `Click the button below to view the project details and get started on this exciting journey. We can't wait to see your contributions!`,
            subject: '🎉 You have Been Selected for the Project!',
            action: {
              instructions: 'Click the button below to visit the project page:',
              text: 'View Project',
              url: 'https://macbease.com/app/projects',
            },
          };
          await pingUsers({
            ids: userIds,
            pingLevel: 2,
            notification,
            email,
          });
        }
      );

      const chatRoomId = `project${updatedProject._id}`;
      await allotProjectChatroom(userIds,chatRoomId);

      return res.status(200).json({
        message: 'Users successfully allotted to the project.',
        project: updatedProject,
      });
    } else {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send('Not authorized to access this route.');
    }
  } catch (error) {
    console.error('Error allotting users to project:', error);
    return res
      .status(500)
      .json({ message: 'Internal server error.', error: error.message });
  }
};

const submitProjectReview = async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const { projectId, review } = req.body;
      const userId = req.user.id;
      if (!review || review.trim() === '') {
        return res.status(400).json({ message: 'Review content is required.' });
      }
      const project = await Project.findById(projectId, {
        createdBy: 1,
        review: 1,
        state: 1,
      });
      if (!project) {
        return res.status(404).json({ message: 'Project not found.' });
      }
      if (project.createdBy.toString() !== userId) {
        return res
          .status(403)
          .json({ message: 'You are not authorized to review this project.' });
      }
      project.review = review;
      project.state = 2;
      const updatedProject = await project.save();
      return res.status(200).json({
        message: 'Review submitted successfully.',
        project: updatedProject,
      });
    } else {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send('Not authorized to access this route.');
    }
  } catch (error) {
    console.error('Error submitting project review:', error);
    return res
      .status(500)
      .json({ message: 'Internal server error.', error: error.message });
  }
};

const getOpenProjects = async (req, res) => {
  try {
    const projects = await Project.find({ state: 0 });
    if (!projects.length) {
      return res.status(200).json({
        message: 'Projects with state 0 is currently empty.',
        projects: [],
      });
    }
    return res.status(200).json({
      message: 'Projects with state 0 retrieved successfully.',
      projects,
    });
  } catch (error) {
    console.error('Error fetching projects with state 0:', error);
    return res
      .status(500)
      .json({ message: 'Internal server error.', error: error.message });
  }
};

const getInterestedCreators = async (req, res) => {
  try {
    const { projectId } = req.query;
    const project = await Project.findById(projectId)
      .populate({
        path: 'interested',
        select: 'name image pushToken _id',
      })
      .select('interested');
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    return res.status(StatusCodes.OK).json(project.interested);
  } catch (error) {
    console.error('Error fetching interested creators', error);
    return res
      .status(500)
      .json({ message: 'Internal server error.', error: error.message });
  }
};

const getAllotedCreators = async (req, res) => {
  try {
    const { projectId } = req.query;
    const project = await Project.findById(projectId)
      .populate({
        path: 'allotedTo',
        select: 'name image pushToken _id',
      })
      .select('allotedTo');
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    return res.status(StatusCodes.OK).json(project.allotedTo);
  } catch (error) {
    console.error('Error fetching alloted creators', error);
    return res
      .status(500)
      .json({ message: 'Internal server error.', error: error.message });
  }
};

const getAllotedProjects = async (req, res) => {
  try {
    const projects = await Project.find({ state: 1 });
    if (!projects.length) {
      return res.status(200).json({
        message: 'Projects with state 1 is currently empty.',
        projects: [],
      });
    }
    return res.status(200).json({
      message: 'Projects with state 1 retrieved successfully.',
      projects,
    });
  } catch (error) {
    console.error('Error fetching projects with state 1:', error);
    return res
      .status(500)
      .json({ message: 'Internal server error.', error: error.message });
  }
};

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

const fetchProjectsBatch = async (req, res) => {
  try {
    const { batchSize, batch } = req.query;
    const size = parseInt(batchSize, 10);
    const batchNumber = parseInt(batch, 10);
    if (isNaN(size) || isNaN(batchNumber) || size <= 0 || batchNumber < 0) {
      return res
        .status(400)
        .json({ message: 'Invalid batchSize or batch number.' });
    }
    const skip = (batchNumber - 1) * size;
    const projects = await Project.find().skip(skip).limit(size).exec();
    if (!projects.length) {
      return res.status(200).json({
        message: 'No projects found for the requested batch.',
        projects: [],
      });
    }
    return res.status(200).json({
      batch: batchNumber,
      batchSize: size,
      projects,
    });
  } catch (error) {
    console.error('Error fetching projects batch:', error);
    return res
      .status(500)
      .json({ message: 'Internal server error.', error: error.message });
  }
};

const getProjectsAllotedToUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const projects = await Project.find({ allotedTo: userId });
    if (!projects.length) {
      return res.status(200).json({
        message: 'No projects found where you are alloted.',
        projects: [],
      });
    }
    return res.status(200).json({
      message: 'Projects fetched successfully.',
      projects,
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return res.status(500).json({
      message: 'Internal server error.',
      error: error.message,
    });
  }
};

const getProjectContents = async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      return res.status(400).json({ message: 'Project ID is required.' });
    }
    const project = await Project.findById(projectId, { media: 1 });
    if (!project) {
      return res.status(404).json({ message: 'Project not found.' });
    }
    const contents = await MacbeaseContent.aggregate([
      { $match: { _id: { $in: project.media } } },
      {
        $addFields: {
          commentsNum: { $size: '$comments' },
          comments: { $slice: ['$comments', 6] },
        },
      },
    ]);
    return res.status(200).json({
      message: 'Contents fetched successfully.',
      contents,
    });
  } catch (error) {
    console.error('Error fetching project contents:', error);
    return res.status(500).json({
      message: 'Internal server error.',
      error: error.message,
    });
  }
};

const fetchProjectById = async(req,res) => {
  const { id } = req.query;

  try{
    const project = await Project.findById(id);

    if(!project){
      return res.status(StatusCodes.BAD_REQUEST).send("Project not found.");
    }

    return res.status(StatusCodes.OK).send(project);
  }catch(err){
    console.log("Error fetching project:",err);
    return res.status(StatusCodes.BAD_REQUEST).send("Something went wrong.");
  }
}

const newProjectChatMessage = async(req,res) => {
  try{
    const { projectId, message, sender } = req.body;

    console.log("Enteredd");
    const project = await Project.findById(projectId,{allotedTo:1,title:1});

    if (!project) {
      console.log("Rpoject not found");
      return res.status(StatusCodes.NOT_FOUND).send("Project not found.");
    }

    const userIds = project.allotedTo.filter((item) => item !== req.user.id);

    if (userIds.length === 0) {
      console.log("No users");
      return res.status(StatusCodes.OK).send("No recipients to notify.");
    }

    const users = await User.find({ _id: { $in: userIds } },{pushToken:1,chatRooms:1});

   await User.updateMany(
      { _id: { $in: userIds }, "chatRooms.doc_id": `project${projectId}` },
      {
        $set: { "chatRooms.$.state": "unread" },
      },
      {
        arrayFilters: [{ "chatRoom.doc_id": `project${projectId}` }],
      }
    );

    const tokens = users.map(item => item.pushToken);
    scheduleNotification2({
      pushToken: tokens,
      title: `${sender} messaged in ${project.title}.`,
      body: `${message.substring(0, 50)}...`,
      url: `https://macbease.com/app/projectMessage/${projectId}`,
    });

    return res.status(StatusCodes.OK).send("Success");
  }catch(err){
    console.log(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Something went wrong.");
  }
}

const allotChatroom = async(req,res) => {
  const {id} = req.query;
  
  try{
    
      const project =await Project.findById(id,{allotedTo:1});
    
      const userIds = project.allotedTo;

      const chatDoc = {
        doc_id:`project${id}`,
        state:"unread",
      }
  
      await User.updateMany(
        {_id: { $in: userIds}},
        {$addToSet: {chatRooms: chatDoc}}
      );
  
      console.log("Successfully added chatRoom."); 
      return res.status(StatusCodes.OK).send("Successful");
    }catch(error){ 
      console.log("Error while alloting chatroom to users:",error);
      return res.status(StatusCodes.BAD_REQUEST).send("Something went wrong.");
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
};
