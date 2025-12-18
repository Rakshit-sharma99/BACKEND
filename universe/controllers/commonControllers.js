const nlp = require("compromise");
const Bag = require("../models/bag");

//function for lemmatization
function lemmatize(tags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return [];
  }
  return tags.map((tag) => {
    let words = tag.split(" ");

    let lemmatizedWords = words.map((word) => {
      const doc = nlp(word);
      let lemma = doc.verbs().toInfinitive().out(); // Get base form if verb

      // If lemma is empty, keep original word
      if (!lemma) return word;

      // Maintain proper capitalization
      return lemma.charAt(0).toUpperCase() + lemma.slice(1);
    });

    return lemmatizedWords.join(" "); // Reconstruct phrase
  });
}

//function to expand the horizon of tags
async function getRelatedTags(query) {
  try {
    const response = await axios.post(
      `http://bag:5090/bag/api/v1/getRelatedTags`,
      { query }
    );
    return response.data;
  } catch (error) {
    console.error("Error in getRelatedTags:", error);
    throw error; // Re-throw the error to be handled upstream
  }
}

function formatDateToMonthDay(dateString) {
  const date = new Date(dateString);
  const options = { month: "short", day: "numeric" };
  return date.toLocaleString("en-US", options);
}

module.exports = {
  lemmatize,
  getRelatedTags,
  formatDateToMonthDay,
};
