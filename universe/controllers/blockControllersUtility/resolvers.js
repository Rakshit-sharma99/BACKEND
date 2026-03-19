const Club = require("../../models/club");
const Community = require("../../models/community");
const User = require("../../models/user");
const mongoose = require("mongoose");

const {
  eventProjection,
  clubProjection,
  communityProjection,
} = require("./genericProjections");
const { fetchEventData, fetchPastEvents, fetchEventGallery, fetchFeaturedEvent } = require("../interServiceCalls");
const { fetchRightSequence } = require("../utils");

module.exports = {
  pagination: async (block) => {
    const grouped = block.payload.reduce(
      (acc, p) => {
        if (p.eventId) acc.eventIds.push(p.eventId);
        if (p.clubId) acc.clubIds.push(p.clubId);
        if (p.communityId) acc.communityIds.push(p.communityId);
        return acc;
      },
      { eventIds: [], clubIds: [], communityIds: [] }
    );

    const fetchRecords = async (Model, ids, projection) => {
      if (!ids.length) return [];
      return await Model.find({ _id: { $in: ids } }, projection).lean();
    };

    const [eventsData, clubsData, communitiesData] = await Promise.all([
      fetchEventData({ ids: grouped.eventIds, fields: eventProjection }),
      fetchRecords(Club, grouped.clubIds, clubProjection),
      fetchRecords(Community, grouped.communityIds, communityProjection),
    ]);

    return [
      ...eventsData.map((e) => ({ ...e, type: "event" })),
      ...clubsData.map((c) => ({ ...c, type: "club" })),
      ...communitiesData.map((cm) => ({ ...cm, type: "community" })),
    ];
  },

  featured_events: async (block) => {
    const events = await fetchFeaturedEvent({ fields: eventProjection });
    const inSequence = await fetchRightSequence(events);
    return inSequence;
  },

  top_clubs: async (block, userId) => {
    const clubs = await Club.aggregate([
      {
        $sort: { rating: -1 },
      },
      {
        $limit: 12,
      },
      {
        $project: {
          secondaryImg: 1,
          featuringImg: 1,
          name: 1,
          tags: 1,
          motto: 1,
          mainAdmin: 1,
          rating: 1,
          membersCount: { $size: "$members" },
          top5Members: { $slice: ["$members", 5] },
          founderId: { $toObjectId: "$mainAdmin" },
          isCore: { $in: [userId, "$team.id"] },
          isAdmin: { $in: [userId, "$adminId"] },
          isMember: { $in: [userId, "$members"] },
        },
      },
      {
        $addFields: {
          top5Members: {
            $map: {
              input: "$top5Members",
              as: "memberId",
              in: { $toObjectId: "$$memberId" },
            },
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "top5Members",
          foreignField: "_id",
          as: "top5Profiles",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "founderId",
          foreignField: "_id",
          as: "foundersDetails",
        },
      },
      {
        $project: {
          secondaryImg: 1,
          featuringImg: 1,
          name: 1,
          tags: 1,
          motto: 1,
          membersCount: 1,
          isCore: 1,
          isAdmin: 1,
          isMember: 1,
          rating: 1,
          top5Profiles: {
            $map: {
              input: "$top5Profiles",
              as: "profile",
              in: {
                id: "$$profile._id",
                name: "$$profile.name",
                img: "$$profile.image",
                pushToken: "$$profile.pushToken",
              },
            },
          },
          foundersDetails: {
            $arrayElemAt: [
              {
                $map: {
                  input: "$foundersDetails",
                  as: "profile",
                  in: {
                    id: "$$profile._id",
                    name: "$$profile.name",
                    img: "$$profile.image",
                    pushToken: "$$profile.pushToken",
                    course: "$$profile.course",
                  },
                },
              },
              0,
            ],
          },
        },
      },
    ]);
    return clubs;
  },

  top_communities: async (block, userId) => {
    const communities = await Community.aggregate([
      {
        $sort: { rating: -1 },
      },
      {
        $limit: 12,
      },
      {
        $project: {
          secondaryCover: 1,
          cover: 1,
          label: 1,
          activeMembers: 1,
          title: 1,
          tag: 1,
          rating: 1,
          membersCount: { $size: "$members" },
          top5Members: { $slice: ["$members", 5] },
          founderId: { $toObjectId: "$creatorId" },
          isMember: { $in: [mongoose.Types.ObjectId(userId), "$members"] },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "top5Members",
          foreignField: "_id",
          as: "top5Profiles",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "founderId",
          foreignField: "_id",
          as: "foundersDetails",
        },
      },
      {
        $project: {
          secondaryCover: 1,
          cover: 1,
          label: 1,
          activeMembers: 1,
          title: 1,
          tag: 1,
          membersCount: 1,
          rating: 1,
          isMember: 1,
          top5Profiles: {
            $map: {
              input: "$top5Profiles",
              as: "profile",
              in: {
                id: "$$profile._id",
                name: "$$profile.name",
                img: "$$profile.image",
                pushToken: "$$profile.pushToken",
              },
            },
          },
          foundersDetails: {
            $arrayElemAt: [
              {
                $map: {
                  input: "$foundersDetails",
                  as: "profile",
                  in: {
                    id: "$$profile._id",
                    name: "$$profile.name",
                    img: "$$profile.image",
                    pushToken: "$$profile.pushToken",
                    course: "$$profile.course",
                  },
                },
              },
              0,
            ],
          },
        },
      },
    ]);
    return communities;
  },

  tile_filters: async (block) => {
    return block.payload.map((p) => ({
      key: p.key,
      value: p.value,
      cover: p.cover,
    }));
  },

  generic_filters: async (block) => {
    return block.payload.map((p) => ({
      key: p.key,
      lib: p.lib,
      name: p.name
    }));
  },

  quadrant_filters: async (block) => {
    return block.payload.map((p) => ({
      key: p.key,
      cover: p.cover,
    }));
  },

  banner: async (block) => {
    const banners = block.payload;
    if (!Array.isArray(banners)) return [];

    const outcome = [];

    // Config map for dynamic selection
    const typeConfig = {
      event: {
        Model: Event,
        idKey: "eventId",
        projection: eventProjection,
      },
      club: {
        Model: Club,
        idKey: "clubId",
        projection: clubProjection,
      },
      community: {
        Model: Community,
        idKey: "communityId",
        projection: communityProjection,
      },
    };

    for (const banner of banners) {
      if (!banner) continue;

      //  Advertisement / External
      if (banner.type === "other") {
        outcome.push({
          type: "other",
          deeplink: banner.deeplink,
          name: banner.name,
          url: banner.url,
          logo: banner.logo,
          description: banner.description,
        });
        continue;
      }

      // Handle event / club / community
      const config = typeConfig[banner.type];
      if (!config) continue;

      const { Model, idKey, projection } = config;

      const id = banner[idKey];
      if (!id) continue;

      if (Model === "Event") {
        const data = await fetchEventData({ id, fields: projection });
        if (data) outcome.push({ type: banner.type, ...data });
      }

      const data = await Model.findById(id, projection).lean();
      if (data) outcome.push({ type: banner.type, ...data });
    }
    return outcome;
  },

  past_events: async (block) => {
    return fetchPastEvents({
      projection: eventProjection,
    });
  },

  event_gallery: async (block) => {
    const eventIds = block.payload.map((p) => p.eventId);

    return fetchEventGallery(eventIds);
  },

  people: async (block, userId) => {
    const currentUser = await User.findById(userId).select("interests");

    if (!currentUser) {
      return null;
    }

    const interests = currentUser.interests || [];

    let matchStage = {
      _id: { $ne: userId },
      deactivated: { $ne: true },
    };

    if (interests.length > 0) {
      matchStage.interests = { $in: interests };
    }

    const users = await User.aggregate([
      { $match: matchStage },

      {
        $addFields: {
          communityCount: {
            $size: { $ifNull: ["$communityContribution", []] },
          },
          clubCount: { $size: { $ifNull: ["$clubContributions", []] } },
        },
      },
      {
        $addFields: {
          contributionScore: {
            $add: ["$macbeaseCount", "$communityCount", "$clubCount"],
          },
        },
      },

      { $sort: { contributionScore: -1 } },

      { $limit: 20 },

      {
        $project: {
          name: 1,
          fullName: 1,
          image: 1,
          course: 1,
          field: 1,
          interests: 1,
          contributionScore: 1,
        },
      },
    ]);

    return users;
  },

  ad_pagination: async (block) => {
    return block.payload.map((p) => ({
      url: p.url,
      deeplink: p.deeplink,
    }));
  },

  clubLeaderboard: async (block) => {
    const clubs = await Club.aggregate([
      {
        $sort: { rating: -1 },
      },
      {
        $limit: 3,
      },
      {
        $project: {
          secondaryImg: 1,
          name: 1,
          tags: 1,
          motto: 1,
          mainAdmin: 1,
          rating: 1,
          membersCount: { $size: "$members" },
        },
      },
    ]);
    return clubs;
  },

  communityLeaderboard: async (block) => {
    const communities = await Community.aggregate([
      {
        $sort: { rating: -1 },
      },
      {
        $limit: 3,
      },
      {
        $project: {
          secondaryCover: 1,
          label: 1,
          activeMembers: 1,
          title: 1,
          tag: 1,
          rating: 1,
          membersCount: { $size: "$members" },
        },
      },
    ]);
    return communities;
  },
};