@echo off
echo ==============================================================================
echo Select the services you want to run locally (comma separated).
echo.
echo Available services: 
echo universe, multiverse, content, card, event, bag, badge, offer, 
echo quest, invitation, itinerary, joinLink, tile, org, unsorted, 
echo ticket, refund, blog, coupon, memory, overlay, map, ipls
echo.
echo Note: The 'core' profile (nginx, kafka, redis) is automatically included.
echo Example: universe,content
echo ==============================================================================
echo.

set /p SELECTED_PROFILES="Enter services (leave empty for 'all'): "

if "%SELECTED_PROFILES%"=="" (
    set TARGET_PROFILES=all
) else (
    set TARGET_PROFILES=core,%SELECTED_PROFILES%
)

echo.
echo Starting profiles: %TARGET_PROFILES%
echo.

set COMPOSE_PROFILES=%TARGET_PROFILES%
docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.profiles.yml up -d --build
