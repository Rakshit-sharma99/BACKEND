import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import User from '../models/user.model';
import schedule from 'node-schedule';
import Project from '../models/project.model';
import MacbeaseContent from '../models/macbeaseContent.model';
import mongoose from 'mongoose';
import { pingUsers, allotProjectChatroom, scheduleNotification2 } from './utils.controller';

/**
 * @desc    Create a new project
 * @route   POST /project
 * @access  Admin
 */
const createProject = async (req: Request, res: Response) => {
  try {
    // Authorization check
    if (req.user.role !== 'admin') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Not authorized to access this route.' });
    }

    // Validate request body
    const { title, description, responseClosedAt } = req.body;
    if (!title || !description || !responseClosedAt) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Title, description, and responseClosedAt are required.' });
    }

    // Create and save project
    const newProject = await Project.create({
      createdBy: req.user.id,
      title,
      description,
      responseClosedAt,
    });

    // Schedule notification
    scheduleProjectNotification(newProject);

    return res
      .status(StatusCodes.CREATED)
      .json({ message: 'Project created successfully.', project: newProject });
  } catch (error) {
    console.error('Error creating project:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error: error });
  }
};

/**
 * @desc Schedule project notification after creation
 * @param project Project object
 */
const scheduleProjectNotification = (project: any) => {
  const scheduleTime = new Date(Date.now() + 3000); // Schedule after 3 seconds

  schedule.scheduleJob(`projectCreated_${project._id}`, scheduleTime, async () => {
    try {
      const notification = {
        title: '🚀 New Project Alert!',
        body: `Great news! A new project titled "${project.title}" is live. Don't miss this opportunity—apply now before the deadline!`,
        img1: 'public/Macbease/Macbease-01.png',
        img2: '',
        key: 'read',
        url: 'https://macbease.com/app/projects',
      };

      const email = {
        name: 'Content Creator',
        intro: `We are thrilled to announce that a new project titled "${project.title}" is now live!`,
        outro: 'Visit the link above to view the project details and get started:',
        subject: '✨ A New Project Awaits You!',
        action: {
          instructions: 'Click on the button below to go to the project:',
          text: 'View Project',
          url: 'https://macbease.com/app/projects',
        },
      };

      await pingUsers({ role: 'Creator', pingLevel: 2, notification, email });
    } catch (error) {
      console.error('Error scheduling notification:', error);
    }
  });
};

/**
 * @desc    Add an interested user to a project
 * @route   POST /project/interested-user
 * @access  User (Only Creators)
 */
const addInterestedUser = async (req: Request, res: Response) => {
  try {
    const { id: userId, role } = req.user;
    const { projectId } = req.params;

    // Validate input
    if (!userId || !projectId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'User ID and Project ID are required.' });
    }

    // Ensure only creators can express interest
    if (role !== 'Creator') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Only content creators can express interest in projects.' });
    }

    // Fetch project with necessary fields
    const project = await Project.findById(projectId, { state: 1, interested: 1 });
    if (!project) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Project not found.' });
    }

    // Check project state
    if (project.state !== 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Cannot express interest. The project is not in a valid state.' });
    }

    // Update project interest list efficiently
    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      { $addToSet: { interested: userId } }, // Prevents duplicate interests
      { new: true },
    );

    return res.status(StatusCodes.OK).json({
      message: 'User added to interested list successfully.',
      project: updatedProject,
    });
  } catch (error) {
    console.error('Error adding user to interested list:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc Remove user from the interested list of a project
 * @route PATCH /project/remove-user-from-interested
 * @access User, Admin
 */
const removeUserFromInterested = async (req: Request, res: Response) => {
  const { projectId } = req.params; // Using params for projectId as it’s a PATCH operation
  const userId = req.user.id;

  if (!projectId) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Project ID is required.' });
  }

  try {
    // Use transaction for consistency and avoid partial updates if needed
    const session = await mongoose.startSession();
    session.startTransaction();

    // Pull user from the interested array in a single update operation
    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      { $pull: { interested: userId } },
      { new: true, session },
    );

    if (!updatedProject) {
      await session.abortTransaction();
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Project not found.' });
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(StatusCodes.OK).json({
      message: 'User successfully removed from the interested list.',
      project: updatedProject,
    });
  } catch (error) {
    console.error('Error removing user from interested list:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc Update project state
 * @route PATCH /project/state
 * @access Admin only
 */
const updateProjectState = async (req: Request, res: Response) => {
  try {
    // Authorization check
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Access denied.' });
    }

    const { state } = req.body;
    const { projectId } = req.params;

    // Validate projectId format
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid project ID format.' });
    }

    // Validate state
    const validStates = [0, 1, 2];
    if (!validStates.includes(state)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: 'Invalid state. Valid states are 0 (NEW), 1 (IN_PROGRESS), or 2 (COMPLETED).',
      });
    }

    // Check if the project exists before updating
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Project not found.' });
    }

    // Update project state
    project.state = state;
    await project.save();

    return res.status(StatusCodes.OK).json({
      message: 'Project state updated successfully.',
      project,
    });
  } catch (error) {
    console.error('Error updating project state:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Internal server error.',
      error: error,
    });
  }
};

/**
 * @desc Allot users to a project and notify them
 * @route PATCH /project/allot-users-to-project
 * @access Admin
 */
const allotUsersToProject = async (req: Request, res: Response) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Access denied.' });
    }

    const { userIds } = req.body;
    const { projectId } = req.params;

    if (!projectId || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: 'Project ID and a non-empty array of user IDs are required.',
      });
    }

    // Check if the project exists first
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Project not found.' });
    }

    // Atomic update to ensure consistency
    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      { $addToSet: { allotedTo: { $each: userIds } }, state: 1 },
      { new: true },
    );

    if (!updatedProject) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to update project allocation.',
      });
    }

    // Schedule notification and email
    schedule.scheduleJob(
      `projectAlloted_${updatedProject._id}`,
      new Date(Date.now() + 3000),
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
          body: `A group chat for this project has been created and added to your chatrooms. Check your messages regularly for updates.`,
          outro: `Click the button below to view the project details and start contributing.`,
          subject: '🎉 You have Been Selected for the Project!',
          action: {
            instructions: 'Click below to view the project:',
            text: 'View Project',
            url: 'https://macbease.com/app/projects',
          },
        };

        await pingUsers({ ids: userIds, pingLevel: 2, notification, email });
      },
    );

    // Assign a chatroom for the project
    await allotProjectChatroom(userIds, `project${updatedProject._id}`);

    return res.status(StatusCodes.OK).json({
      message: 'Users successfully allotted to the project.',
      project: updatedProject,
    });
  } catch (error) {
    console.error('Error allotting users to project:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Internal server error.',
      error: error,
    });
  }
};

/**
 * @desc    Submit a review for a project
 * @route   PUT /project/review
 * @access  Admin
 */
const submitProjectReview = async (req: Request, res: Response) => {
  if (req.user.role !== 'admin') {
    return res.status(StatusCodes.FORBIDDEN).json({ message: 'Access denied.' });
  }

  const { projectId, review } = req.body;
  const userId = req.user.id;

  // Validate projectId
  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid project ID.' });
  }

  // Validate review content
  if (!review || review.trim() === '') {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Review content is required.' });
  }

  try {
    const project = await Project.findOne({ _id: projectId }, 'createdBy review state');

    // Check if project exists
    if (!project) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Project not found.' });
    }

    // Check if the user is authorized to review this project
    if (project.createdBy.toString() !== userId) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Unauthorized to review this project.' });
    }

    // Update review and state
    project.review = review;
    project.state = 2;

    // Save the updated project
    const updatedProject = await project.save();

    return res.status(StatusCodes.OK).json({
      message: 'Review submitted successfully.',
      project: {
        id: updatedProject._id,
        review: updatedProject.review,
        state: updatedProject.state,
      },
    });
  } catch (error) {
    console.error('Error submitting project review:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc Get open projects (state 0)
 * @route GET /project/open
 * @access User, Admin
 */
const getOpenProjects = async (req: Request, res: Response) => {
  try {
    const projects = await Project.find({ state: 0 }).lean();

    return res.status(StatusCodes.OK).json({
      message: projects.length
        ? 'Projects with state 0 retrieved successfully.'
        : 'No open projects found.',
      projects,
    });
  } catch (error) {
    console.error('Error fetching projects with state 0:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Internal server error.',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * @desc Get interested creators for a specific project
 * @route GET /project/interested-creators
 * @access Public, Admin
 */
const getInterestedCreators = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params; // Using params instead of query for consistency with RESTful design

    // Validate the projectId format
    if (!projectId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Project ID is required.' });
    }

    // Fetch the project and its interested creators with only necessary fields
    const project = await Project.findById(projectId).select('interested').populate({
      path: 'interested',
      select: 'name image pushToken _id',
    });

    if (!project) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Project not found.' });
    }

    // Check if there are interested creators to return
    if (!project.interested || project.interested.length === 0) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'No interested creators found.' });
    }

    // Return interested creators with optimized response format
    return res.status(StatusCodes.OK).json({
      success: true,
      count: project.interested.length,
      data: project.interested,
    });
  } catch (error) {
    console.error('Error fetching interested creators:', error);

    // Handle different error types
    if (error instanceof mongoose.Error.CastError) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid project ID format.' });
    }

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Internal server error.',
      error: error,
    });
  }
};

/**
 * @desc Get all allotted creators for a project
 * @route GET /project/alloted-creators
 * @access User, Admin
 */
const getAllotedCreators = async (req: Request, res: Response) => {
  const { projectId } = req.query;

  if (!projectId) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Project ID is required.' });
  }

  // Fetch project and its allotted users efficiently
  const project = await Project.findById(projectId)
    .populate({
      path: 'allotedTo',
      select: 'name image pushToken _id',
    })
    .select('allotedTo')
    .lean();

  if (!project) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: 'Project not found.' });
  }

  res.status(StatusCodes.OK).json({ creators: project.allotedTo });
};

/**
 * @desc Fetch all projects with state 1
 * @route GET /project/alloted-projects
 * @access User, Admin
 */
const getAllotedProjects = async (req: Request, res: Response) => {
  try {
    // Retrieve projects with optimized filtering and performance
    const projects = await Project.find({ state: 1 }).lean(); // `.lean()` for better performance by skipping Mongoose document overhead

    // Handle empty result set
    if (!projects.length) {
      return res.status(StatusCodes.OK).json({
        message: 'No projects found with state 1.',
        projects: [],
      });
    }

    // Respond with retrieved projects
    return res.status(StatusCodes.OK).json({
      message: 'Projects with state 1 retrieved successfully.',
      projects,
    });
  } catch (error) {
    console.error('Error fetching projects with state 1:', error);

    // Proper error handling with meaningful response
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Internal server error while retrieving projects.',
      error: error, // Return a detailed error if available
    });
  }
};

/**
 * @desc Review a project by adding a review and updating its state
 * @route PATCH /project/review
 * @access Admin
 */
const reviewProject = async (req: Request, res: Response) => {
  try {
    // Verify the user role
    if (req.user.role !== 'admin') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'Not authorized to access this route.' });
    }

    // Extract projectId and review from the request body
    const { projectId, review } = req.body;

    // Validate input
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid project ID.' });
    }

    if (!review || typeof review !== 'string' || review.trim() === '') {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Review must be a non-empty string.' });
    }

    // Find and update the project
    const project = await Project.findByIdAndUpdate(
      projectId,
      { $set: { review, state: 2 } },
      { new: true },
    );

    // Handle project not found case
    if (!project) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Project not found.' });
    }

    // Respond with success
    return res.status(StatusCodes.OK).json({
      message: 'Project reviewed successfully.',
      project,
    });
  } catch (error) {
    console.error('Error reviewing project:', error);

    // Return proper error response
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Internal server error.',
      error: error || 'Unexpected error occurred.',
    });
  }
};

/**
 * @desc Fetches a batch of projects with pagination.
 * @route GET /project/batch
 * @access User, Admin
 * @query {number} batchSize - Number of projects per batch (default: 10)
 * @query {number} batch - Batch number to fetch (default: 1)
 * @returns {Object} JSON response with the requested batch of projects or appropriate error message.
 */
const fetchProjectsBatch = async (req: Request, res: Response) => {
  try {
    // Parse query parameters with default values
    const batchSize = parseInt(req.query.batchSize as string, 10) || 10;
    const batch = parseInt(req.query.batch as string, 10) || 1;

    // Validate query parameters
    if (batchSize <= 0 || batch < 1) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: 'Invalid batchSize or batch number. Must be positive integers.',
      });
    }

    const skip = (batch - 1) * batchSize;

    // Query projects with pagination and fetch total count simultaneously
    const [projects, totalProjects] = await Promise.all([
      Project.find({}).skip(skip).limit(batchSize).lean().exec(),
      Project.countDocuments({}),
    ]);

    // Calculate total pages
    const totalPages = Math.ceil(totalProjects / batchSize);

    if (!projects.length) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: 'No projects found for the requested batch.',
        projects: [],
      });
    }

    // Return paginated projects with additional metadata
    return res.status(StatusCodes.OK).json({
      batch,
      batchSize,
      totalPages,
      totalProjects,
      projects,
    });
  } catch (error) {
    console.error('Error fetching projects batch:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Internal server error.',
      error: error,
    });
  }
};

/**
 * @desc    Fetch all projects allotted to a specific user
 * @route   GET /project/alloted-to-user
 * @access  User, Admin
 */
const getProjectsAllotedToUser = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    // Edge case: Check if userId is missing
    if (!userId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: 'User ID is missing or invalid.',
      });
    }

    // Fetch projects allotted to the user (fetching only relevant fields for optimization)
    const projects = await Project.find({ allotedTo: userId }, 'name description status');

    // If no projects are found
    if (!projects.length) {
      return res.status(StatusCodes.OK).json({
        message: 'No projects found where you are allotted.',
        projects: [],
      });
    }

    // Successfully fetched projects
    return res.status(StatusCodes.OK).json({
      message: 'Projects fetched successfully.',
      projects,
    });
  } catch (error: unknown) {
    console.error('Error fetching projects:', error);

    // Return generic error response with proper status code
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Internal server error.',
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * @desc    Fetch project contents
 * @route   GET /project/contents
 * @access  User, Admin
 */
const getProjectContents = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;

    // Validate projectId
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId as string)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Invalid or missing Project ID.' });
    }

    // Fetch project with only media field
    const project = await Project.findById(projectId, { media: 1 }).lean();
    if (!project) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Project not found.' });
    }

    if (!project.media || project.media.length === 0) {
      return res.status(StatusCodes.OK).json({ message: 'No media found.', contents: [] });
    }

    // Fetch media contents efficiently
    const contents = await MacbeaseContent.aggregate([
      { $match: { _id: { $in: project.media } } },
      {
        $project: {
          _id: 1,
          title: 1,
          url: 1,
          createdAt: 1,
          commentsNum: { $size: '$comments' },
          comments: { $slice: ['$comments', 6] },
        },
      },
    ]);

    return res.status(StatusCodes.OK).json({
      message: 'Contents fetched successfully.',
      contents,
    });
  } catch (error) {
    console.error('Error fetching project contents:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Internal server error.',
      error: error,
    });
  }
};

/**
 * @desc Fetch a project by ID
 * @route GET /project/:id
 * @access User, Admin
 */
const fetchProjectById = async (req: Request, res: Response) => {
  const { id } = req.params;

  // Validate the ID format
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid project ID format.' });
  }

  try {
    // Fetch the project by ID
    const project = await Project.findById(id).lean().exec(); // Use lean() for performance

    if (!project) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Project not found.' });
    }

    return res.status(StatusCodes.OK).json({ data: project });
  } catch (err) {
    console.error('Error fetching project:', err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'An unexpected error occurred. Please try again later.',
    });
  }
};

/**
 * @desc Create a new chat message for a project and notify the assigned users
 * @route POST /new-project-chat-message
 * @access User, Admin
 */
const newProjectChatMessage = async (req: Request, res: Response) => {
  try {
    const { projectId, message, sender } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!projectId || !message || !sender) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Missing required fields.' });
    }

    // Find the project and handle not found scenario
    const project = await Project.findById(projectId, { allotedTo: 1, title: 1 });
    if (!project) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Project not found.' });
    }

    // Filter out the sender from the assigned users
    const userIds = project.allotedTo.filter((item) => item.toString() !== userId);
    if (userIds.length === 0) {
      return res.status(StatusCodes.OK).json({ message: 'No recipients to notify.' });
    }

    // Fetch users' push tokens and chat room details
    const users = await User.find({ _id: { $in: userIds } }, { pushToken: 1, chatRooms: 1 });

    // Update chat room status for the project
    await User.updateMany(
      { _id: { $in: userIds }, 'chatRooms.doc_id': `project${projectId}` },
      {
        $set: { 'chatRooms.$.state': 'unread' },
      },
      {
        arrayFilters: [{ 'chatRooms.doc_id': `project${projectId}` }],
      },
    );

    // Prepare the notification tokens and send notification
    const tokens = users.map((item) => item.pushToken).filter(Boolean) as string[];
    if (tokens.length > 0) {
      scheduleNotification2({
        pushToken: tokens,
        title: `${sender} messaged in ${project.title}.`,
        body: `${message.substring(0, 50)}...`,
        url: `https://macbease.com/app/projectMessage/${projectId}`,
      });
    }

    return res.status(StatusCodes.OK).json({ message: 'Message sent successfully.' });
  } catch (err) {
    console.error(err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', err });
  }
};

/**
 * @desc Allots a chatroom for a project and associates it with the users assigned to the project
 * @route POST /allot-chatroom
 * @access User, Admin
 */
const allotChatroom = async (req: Request, res: Response) => {
  const { id } = req.query;

  // Validate input
  if (!id || !mongoose.isValidObjectId(id)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid or missing project ID' });
  }

  try {
    // Fetch project with necessary fields (minimized DB call)
    const project = await Project.findById(id, { allotedTo: 1 });

    if (!project) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Project not found' });
    }

    const userIds = project.allotedTo;

    // Handle case where no users are assigned
    if (!userIds || userIds.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: 'No users assigned to this project' });
    }

    const chatDoc = {
      doc_id: `project${id}`,
      state: 'unread',
    };

    // Update users in a single query
    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { $addToSet: { chatRooms: chatDoc } },
    );

    if (result.modifiedCount === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Failed to add chatroom to users' });
    }

    console.log('Successfully added chatRoom.');
    return res.status(StatusCodes.OK).json({ message: 'Chatroom successfully alloted' });
  } catch (error) {
    console.error('Error while allotting chatroom to users:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong', error });
  }
};

export {
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
