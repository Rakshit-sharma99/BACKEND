import os
import numpy as np
import umap
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")

CANVAS_WIDTH = 1500
CANVAS_HEIGHT = 1500
PADDING = 150  # breathing space from edges

client = MongoClient(MONGO_URI)
db = client.test
nodes = list(db.semanticnodes.find({"embedding": {"$exists": True}}))

embeddings = np.array([n["embedding"] for n in nodes])

reducer = umap.UMAP(
    n_components=2,
    n_neighbors=15,
    min_dist=0.1,
    metric="cosine",
    random_state=42
)

coords = reducer.fit_transform(embeddings)

# ---------------- NORMALIZATION ----------------
xs = coords[:, 0]
ys = coords[:, 1]

min_x, max_x = xs.min(), xs.max()
min_y, max_y = ys.min(), ys.max()

def scale(val, min_val, max_val, target_min, target_max):
    if max_val - min_val == 0:
        return (target_min + target_max) / 2
    return target_min + (val - min_val) * (target_max - target_min) / (max_val - min_val)

scaled_coords = [
    (
        scale(x, min_x, max_x, PADDING, CANVAS_WIDTH - PADDING),
        scale(y, min_y, max_y, PADDING, CANVAS_HEIGHT - PADDING),
    )
    for x, y in coords
]

# ---------------- SAVE BACK ----------------
for node, (x, y) in zip(nodes, scaled_coords):
    db.semanticnodes.update_one(
        {"_id": node["_id"]},
        {
            "$set": {
                "position.x": float(x),
                "position.y": float(y),
            }
        }
    )

print("UMAP projection normalized to canvas")