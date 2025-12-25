const Project = require("../../../models/project");

const content_addedto_project = async (messageValue) => {
  try {
    const { projectId, contentId } = JSON.parse(messageValue);

    if (!projectId || !contentId) {
      console.warn("Both projectId and contentId are required.");
      return;
    }

    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      { $addToSet: { media: contentId } },
      { new: true }
    );

    if (!updatedProject) {
      console.warn("Project not found.");
      return;
    }

  } catch (err) {
    console.error("❌ Failed to process content addedto project topic:",err);
  }
};

module.exports = { content_addedto_project }
