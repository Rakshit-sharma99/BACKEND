import nlp from 'compromise';
import Bag from '../models/bag.model';

// Function for lemmatization
function lemmatize(tags: string[]): string[] {
  return tags.map((tag) => {
    const words = tag.split(' ');
    const lastWord = words[words.length - 1];

    const doc = nlp(lastWord);
    const lemma = doc.verbs().toInfinitive().out() || lastWord;
    words[words.length - 1] = lemma.charAt(0).toUpperCase() + lemma.slice(1);

    return words.join(' ');
  });
}

// Function to expand the horizon of tags
async function getRelatedTags(query: string[]): Promise<string[]> {
  if (!query?.length) return [];

  const validQuery = query.filter((keyword) => keyword.trim() !== '');
  if (!validQuery.length) return [];

  try {
    // Create pipelines for text search
    const pipelines = validQuery.map((keyword) => ({
      $search: {
        index: 'default',
        text: { query: keyword, path: ['keyWords'] },
      },
    }));

    // Execute all aggregation pipelines in parallel
    const results = await Promise.all(pipelines.map((pipeline) => Bag.aggregate([pipeline])));

    // Collect unique keywords from matching documents
    const finalData = new Set<string>(validQuery);
    results
      .flat()
      .forEach((bag) => bag.keyWords.forEach((keyword: string) => finalData.add(keyword)));

    return Array.from(finalData);
  } catch (error) {
    console.error('Error in getRelatedTags:', error);
    throw error; // Re-throw for upstream handling
  }
}

// Function to format date to Month and Day (e.g., 'Jan 2')
function formatDateToMonthDay(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export { lemmatize, getRelatedTags, formatDateToMonthDay };
