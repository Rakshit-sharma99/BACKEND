#!/bin/bash
if [ "$#" -eq 0 ]; then
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
else
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build "$@" nginx
fi