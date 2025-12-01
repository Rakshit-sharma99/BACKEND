# macbease-backend-typescript
MacBease App Backend in TypeScript

## Controllers Tested ✅

### Chat Controllers
| Name                 | Name                  | Name                | Name                   |
| -------------------- | --------------------- | ------------------- | ---------------------- |
| chat/getAllChatRooms | chat/gotOffline       | chat/getUnreadRooms | chat/createNewChatRoom |
| chat/deleteChatRoom  | chat/markAsRead       | chat/checkBlockage  | chat/isOnline          |
| chat/markAsUnread    | chat/metaDataChatRoom | chat/acceptMessage  | chat/declineMessage    |

### User Controllers
| Name                             | Name                          | Name                           | Name                     |
| -------------------------------- | ----------------------------- | ------------------------------ | ------------------------ |
| user/getUser                     | user/deleteUser               | user/getUserByToken            | user/advanceSearch       |
| user/getRandomUsers              | user/changePassword           | user/verifyEmail               | user/completeProfile     |
| user/getInactiveUsers            | user/sendBatchedNotifications | user/deactivateAccount         | user/pushPermanentNotice |
| user/getProfessorRecommendations | user/searchFromAllProfessors  | user/sendMailVerification      | user/cleanUp             |
| user/search                      | user/fetchMultipleProfiles    | user/getCommunitiesForPost     | user/sendMailToUsers     |
| user/sendNotification            | user/getPermanentNotices      | user/getPermanentNoticeInBatch | user/deleteNotifications |
| user/getAllUsers                 | user/searchUserByName         | user/getUserBio                | user/updateUser          |
| user/getPushTokens               | user/getBasicUserBio          | user/tuneIn                    | user/untune              |
| user/getMacbeaseContribution     |

### User Authentication Controllers
| Name                   | Name                           | Name                       | Name                           |
| ---------------------- | ------------------------------ | -------------------------- | ------------------------------ |
| userAuth/loginUser     | userAuth/registerUser          | userAuth/setOtp            | userAuth/setNewPassword        |
| userAuth/pushToken     | userAuth/userNameAvailable     | userAuth/emailVerification | userAuth/regenerateAccessToken |
| userAuth/generateAbout | userAuth/generateResearchAreas | userAuth/generateInterest  | userAuth/reactivateAccount     |
| userAuth/recoveryEmail |                                |                            |                                |

### Admin Authentication Controllers
| Name                     | Name                 | Name                            | Name             |
| ------------------------ | -------------------- | ------------------------------- | ---------------- |
| adminAuth/registerAdmin  | adminAuth/loginAdmin | adminAuth/regenerateAccessToken | adminAuth/setOtp |
| adminAuth/setNewPassword |                      |                                 |                  |

### Card Controllers
| Name                 | Name                       | Name                  | Name               |
| -------------------- | -------------------------- | --------------------- | ------------------ |
| card/deleteCard      | card/getLikedCards         | card/likeACard        | card/unlikeACard   |
| card/getCardsOfUser  | card/createCard            | card/modifyCard       | card/getCardFromId |
| card/getCardsFromTag | card/saveInterest          | card/getYourInterests | card/getAllCards   |
| card/getUserBio      | card/getPeopleRelatedToYou | card/getRandomCards   | card/indexedReturn |
| card/vectorEmbedding | card/vectorQuery           | card/getRandomVideos  | card/queryReturn   |

### Badge Controllers
| Name                   | Name                       | Name                  | Name            |
| ---------------------- | -------------------------- | --------------------- | --------------- |
| badge/generateBadges   | badge/giveAdditionalBadges | badge/getUnusedBadges | badge/giveBadge |
| badge/updateUserImages |                            |                       |                 |

### Bag Controllers
| Name                | Name                   | Name               | Name                 |
| ------------------- | ---------------------- | ------------------ | -------------------- |
| bag/createBag       | bag/searchBags         | bag/getAllKeywords | bag/unsortedTag      |
| bag/getUnsortedTags | bag/sortATag           | bag/getKeysFromBag | bag/deleteKeyFromBag |
| bag/deleteBag       | bag/deleteUnsortedWord | bag/masterSearch   |                      |

### Tile Controllers
| Name            | Name            | Name          |
| --------------- | --------------- | ------------- |
| tile/createTile | tile/deleteTile | tile/getTiles |

### Club Controllers
| Name                          | Name                   | Name                        | Name                      |
| ----------------------------- | ---------------------- | --------------------------- | ------------------------- |
| club/nullifyClubDynamicIsland | club/searchClubEvent   | club/getClub                | club/getAllClub           |
| club/getCreatorId             | club/isMainAdmin       | club/getClubNotifications   | club/isMember             |
| club/isAdmin                  | club/getClubBio        | club/getLatestContent       | club/removeTeamMember     |
| club/getClubVideos            | club/updateRating      | club/getLikeStatus          | club/addTeamMember        |
| club/getClubGallery           | club/getClubProfile    | club/getClubsByTag          | club/editProfile          |
| club/getClubContent           | club/getClubsPartOf    | club/getAllEvents           | club/deleteNotifications  |
| club/addNotifications         | club/removeGallery     | club/postGallery            | club/removeContent        |
| club/postContent              | club/removeEvent       | club/removeAdmin            | club/addAdmin             |
| club/removeAsMember           | club/addAsMember       | club/leaveAsMember          | club/joinAsMember         |
| club/deleteClub               | club/createClub        | club/getFastFeed            | club/getStatus            |
| club/getFastNativeFeed        | club/getAllLikedPins   | club/getSimilarGroups       | club/getEveryoneOfClub    |
| club/getAllContent            | club/getPushTokenChunk | club/changeLeader           | club/getClubContributions |
| club/addProposal              | club/fetchProposals    | club/changeProposalStatus   | club/searchClubMembers    |
| club/searchClubContent        | club/newClubMessage    | club/clubsWithPostingRights | club/searchClubProposals  |
| club/getClubContentByMonth    | club/searchClubFiles   | club/                       | club/                     |
| club/                         | club/                  | club/                       | club/                     |

### Content Controllers
| Name                       | Name                   | Name                     | Name                       |
| -------------------------- | ---------------------- | ------------------------ | -------------------------- |
| content/searchContentByTag | content/getContent     | content/getComments      | content/getPopularComments |
| content/likeComment        | content/unLikeComment  | content/getContentBySpan | content/editContent        |
| content/getMacbContent     | content/replyToComment | content/contentEmbedding | content/generateHashTags   |
| content/deleteContent      |                        |                          |                            |

### Payment Controllers
| Name                          | Name                | Name | Name |
| ----------------------------- | ------------------- | ---- | ---- |
| payment/generatePaymentIntent | payment/createOrder |      |      |

### Event Controllers
| Name            | Name                   | Name               | Name                 |
| --------------- | ---------------------- | ------------------ | -------------------- |
| event/getEvents | event/checkEventStatus | event/getEventById | event/clearEventFeed |

### Itinerary Controllers
| Name                            | Name                          | Name                            | Name                    |
| ------------------------------- | ----------------------------- | ------------------------------- | ----------------------- |
| itinerary/updateItineraryStatus | itinerary/createItinerary     | itinerary/getOrderedItineraries | itinerary/rsvpItinerary |
| itinerary/addToNotifyList       | itinerary/getItinerariesByIds | itinerary/fetchRSVPList         | itinerary/editItinerary |

### Ticket Controllers
| Name                  | Name              | Name               | Name              |
| --------------------- | ----------------- | ------------------ | ----------------- |
| ticket/generateTicket | ticket/scanTicket | ticket/reviewEvent | ticket/likeReview |
| ticket/unLikeReview   |                   |                    |                   |

### Frontend Controller

| Name                 |
| -------------------- |
| frontend/verifyToken |

### Invitation Controller
| Name                        | Name                         | Name                         | Name                         |
| --------------------------- | ---------------------------- | ---------------------------- | ---------------------------- |
| invitation/createInvitation | invitation/getInvitationInfo | invitation/declineInvitation | invitation/endorseInvitation |

### Resource Controller

| Name                          | Name                             | Name                    | Name                  |
| ----------------------------- | -------------------------------- | ----------------------- | --------------------- |
| resource/createResource       | resource/logResourceDownload     | resource/deleteResource | resource/getReviews   |
| resource/submitReview         | resource/searchResources         | resource/getResources   | resources/getResource |
| resources/getRecommendedNotes | resources/searchFromAllResources |
|                               |                                  |

### Community Controller
| Name                               | Name                                 | Name                                | Name                                  |
| ---------------------------------- | ------------------------------------ | ----------------------------------- | ------------------------------------- |
| community/searchCommunityMembers   | community/searchCommunityContent     | community/searchCommunityFiles      | community/removeFromConstraintList    |
| community/getConstraintStatus      | community/updateBooleanField         | community/addAdmin                  | community/removeAdmin                 |
| community/editCommunityProfile     | community/addToConstraintList        | community/gotOffline                | community/getAllContributionOfUser    |
| community/getAllMembers            | community/getOthersContributionCover | community/getBatchedContent         | community/getMediaAndDocs             |
| community/post                     | community/getAllRelatedSocialGroups  | community/getAllRelatedSocialGroups | community/getAllTags                  |
| community/getLikedPosts            | community/getFastNativeFeed          | community/getFastFeed               | community/getBasicCommunityDataFromId |
| community/getUserContributionCover | community/getContribution            | community/                          | community/                            |
| community/                         | community/                           | community/                          | community/                            |
| community/                         | community/                           | community/                          | community/                            |
| community/                         | community/                           | community/                          | community/                            |


| Name                       | Name                                 | Name                            | Name                       |
| -------------------------- | ------------------------------------ | ------------------------------- | -------------------------- |
| content/getContent         | macbeaseContent/getContentTeamAdmins | project/newProjectChatMessage   | project/getOpenProjects    |
| card/getCardsOfUser        | project/addInterestedUser            | project/removeUserFromIntereted | project/getAllotedCreators |
| project/getProjectContents |
