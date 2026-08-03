# Multi-stage Dockerfile for ikmal editor
FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod ./
COPY main.go ./
COPY quality_server.go ./
COPY quality_setup.go ./
COPY quality_transformer.mjs ./
COPY quality-package.json ./
COPY rules/ ./rules/

RUN CGO_ENABLED=0 go build -o ikmal-editor .

# Production runtime image with Java JRE & curl
FROM openjdk:17-alpine

RUN apk add --no-cache bash curl unzip nodejs npm

WORKDIR /root
COPY --from=builder /app/ikmal-editor /usr/local/bin/ikmal-editor

EXPOSE 8097

ENTRYPOINT ["ikmal-editor"]
