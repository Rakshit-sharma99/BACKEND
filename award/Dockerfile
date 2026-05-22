FROM node:18-alpine
WORKDIR /app
COPY . .
RUN apk add --no-cache fontconfig ttf-dejavu
RUN npm install
CMD ["npm", "start"]
