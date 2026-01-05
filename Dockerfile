# =============================================================================
# Nervbox Docker Multi-Stage Build
# =============================================================================
# Build Context: Parent directory containing both nervbox/ and nervbox-mixer/
#
# Stage 1: Build .NET Backend
# Stage 2: Build nervbox-player (Angular 21)
# Stage 3: Build nervbox-mixer (Angular 20)
# Stage 4: Runtime Image
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: .NET Backend Build
# -----------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS backend-build
WORKDIR /src

# Copy project file and restore dependencies (path relative to parent context)
COPY nervbox/NervboxDeamon/NervboxDeamon.csproj NervboxDeamon/
RUN dotnet restore NervboxDeamon/NervboxDeamon.csproj

# Copy source and build
COPY nervbox/NervboxDeamon/ NervboxDeamon/
WORKDIR /src/NervboxDeamon
RUN dotnet publish -c Release -o /app/publish --no-restore

# -----------------------------------------------------------------------------
# Stage 2: nervbox-player Build (Angular 21)
# -----------------------------------------------------------------------------
FROM node:22-alpine AS player-build
WORKDIR /app

# Copy package files and install dependencies
COPY nervbox/nervbox-player/package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source and create secrets from example (for Docker build)
COPY nervbox/nervbox-player/ ./
RUN cp src/environments/secrets.example.ts src/environments/secrets.ts
RUN npm run build -- --configuration production

# -----------------------------------------------------------------------------
# Stage 3: nervbox-mixer Build (Angular 20)
# -----------------------------------------------------------------------------
FROM node:22-alpine AS mixer-build
WORKDIR /app

# Copy package files and install dependencies
COPY nervbox-mixer/package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source and build for Docker deployment (baseHref: /mixer/)
COPY nervbox-mixer/ ./
RUN npm run build -- --configuration production --base-href /mixer/

# -----------------------------------------------------------------------------
# Stage 4: Runtime Image
# -----------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine AS runtime

# Install required packages
RUN apk add --no-cache \
    icu-libs \
    tzdata

# Set environment
ENV ASPNETCORE_ENVIRONMENT=Docker \
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false \
    TZ=Europe/Berlin

WORKDIR /app

# Copy backend
COPY --from=backend-build /app/publish .

# Copy player to wwwroot
COPY --from=player-build /app/dist/nervbox-player/browser ./wwwroot/

# Copy mixer to wwwroot/mixer (Angular 20 outputs to dist/nervbox-mixer without /browser)
COPY --from=mixer-build /app/dist/nervbox-mixer ./wwwroot/mixer/

# Create data directories
RUN mkdir -p /data/sounds /data/avatars /var/log/nervbox

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/sound || exit 1

# Start application
ENTRYPOINT ["dotnet", "NervboxDeamon.dll"]
