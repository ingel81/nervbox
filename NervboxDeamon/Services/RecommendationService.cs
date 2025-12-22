using System;
using System.Collections.Generic;
using System.Linq;
using NervboxDeamon.DbModels;
using NervboxDeamon.Models.View;
using NervboxDeamon.Services.Interfaces;

namespace NervboxDeamon.Services
{
    public interface IRecommendationService
    {
        /// <summary>
        /// Get sounds similar to a given sound based on collaborative filtering
        /// (users who played this sound also played these sounds)
        /// </summary>
        List<SoundRecommendation> GetSimilarSounds(string soundHash, int limit = 10);

        /// <summary>
        /// Get personalized sound recommendations for a user
        /// </summary>
        List<SoundRecommendation> GetPersonalizedRecommendations(int userId, int limit = 10);
    }

    public class RecommendationService : IRecommendationService
    {
        private readonly NervboxDBContext _dbContext;

        public RecommendationService(NervboxDBContext dbContext)
        {
            _dbContext = dbContext;
        }

        public List<SoundRecommendation> GetSimilarSounds(string soundHash, int limit = 10)
        {
            // Get users who played this sound
            var usersWhoPlayedThisSound = _dbContext.SoundUsages
                .Where(u => u.SoundHash == soundHash && u.UserId.HasValue)
                .Select(u => u.UserId.Value)
                .Distinct()
                .ToList();

            if (!usersWhoPlayedThisSound.Any())
            {
                // No data, return empty
                return new List<SoundRecommendation>();
            }

            // Get all sounds played by these users (excluding the input sound)
            var candidateSounds = _dbContext.SoundUsages
                .Where(u => usersWhoPlayedThisSound.Contains(u.UserId.Value)
                         && u.SoundHash != soundHash
                         && u.Sound.Enabled)
                .GroupBy(u => new { u.SoundHash, u.Sound.Name })
                .Select(g => new
                {
                    SoundHash = g.Key.SoundHash,
                    SoundName = g.Key.Name,
                    PlayCount = g.Count(),
                    UniqueUsers = g.Select(x => x.UserId).Distinct().Count()
                })
                .OrderByDescending(x => x.UniqueUsers) // Prioritize sounds played by many similar users
                .ThenByDescending(x => x.PlayCount)
                .Take(limit)
                .ToList();

            // Calculate match score (0-100%)
            var totalUsers = usersWhoPlayedThisSound.Count;

            return candidateSounds.Select(c => new SoundRecommendation
            {
                SoundHash = c.SoundHash,
                SoundName = c.SoundName,
                Score = (int)Math.Round((double)c.UniqueUsers / totalUsers * 100),
                Reason = $"{c.UniqueUsers} von {totalUsers} Nutzern mögen auch diesen Sound"
            }).ToList();
        }

        public List<SoundRecommendation> GetPersonalizedRecommendations(int userId, int limit = 10)
        {
            // Get sounds this user has played
            var userSounds = _dbContext.SoundUsages
                .Where(u => u.UserId == userId)
                .GroupBy(u => u.SoundHash)
                .Select(g => new
                {
                    SoundHash = g.Key,
                    PlayCount = g.Count()
                })
                .OrderByDescending(x => x.PlayCount)
                .Take(20) // Use top 20 most played sounds for similarity
                .ToList();

            if (!userSounds.Any())
            {
                // New user, return most popular sounds
                return GetMostPopularSounds(limit);
            }

            // Find similar users (users who played the same sounds)
            var userSoundHashes = userSounds.Select(s => s.SoundHash).ToList();

            var similarUsers = _dbContext.SoundUsages
                .Where(u => u.UserId.HasValue
                         && u.UserId != userId
                         && userSoundHashes.Contains(u.SoundHash))
                .GroupBy(u => u.UserId.Value)
                .Select(g => new
                {
                    UserId = g.Key,
                    OverlapCount = g.Select(x => x.SoundHash).Distinct().Count(),
                    TotalPlays = g.Count()
                })
                .OrderByDescending(x => x.OverlapCount)
                .Take(50) // Top 50 most similar users
                .ToList();

            if (!similarUsers.Any())
            {
                return GetMostPopularSounds(limit);
            }

            var similarUserIds = similarUsers.Select(u => u.UserId).ToList();

            // Get sounds played by similar users that this user hasn't played
            var recommendations = _dbContext.SoundUsages
                .Where(u => similarUserIds.Contains(u.UserId.Value)
                         && !userSoundHashes.Contains(u.SoundHash)
                         && u.Sound.Enabled)
                .GroupBy(u => new { u.SoundHash, u.Sound.Name })
                .Select(g => new
                {
                    SoundHash = g.Key.SoundHash,
                    SoundName = g.Key.Name,
                    PlayCount = g.Count(),
                    UniqueUsers = g.Select(x => x.UserId).Distinct().Count()
                })
                .OrderByDescending(x => x.UniqueUsers)
                .ThenByDescending(x => x.PlayCount)
                .Take(limit)
                .ToList();

            return recommendations.Select(r => new SoundRecommendation
            {
                SoundHash = r.SoundHash,
                SoundName = r.SoundName,
                Score = CalculatePersonalizedScore(r.UniqueUsers, similarUsers.Count),
                Reason = "Basierend auf deinen Lieblingssounds"
            }).ToList();
        }

        private List<SoundRecommendation> GetMostPopularSounds(int limit)
        {
            var popular = _dbContext.SoundUsages
                .Where(u => u.Sound.Enabled)
                .GroupBy(u => new { u.SoundHash, u.Sound.Name })
                .Select(g => new
                {
                    SoundHash = g.Key.SoundHash,
                    SoundName = g.Key.Name,
                    PlayCount = g.Count(),
                    UniqueUsers = g.Select(x => x.UserId).Distinct().Count()
                })
                .OrderByDescending(x => x.UniqueUsers)
                .ThenByDescending(x => x.PlayCount)
                .Take(limit)
                .ToList();

            return popular.Select(p => new SoundRecommendation
            {
                SoundHash = p.SoundHash,
                SoundName = p.SoundName,
                Score = 100,
                Reason = $"Beliebt bei {p.UniqueUsers} Nutzern"
            }).ToList();
        }

        private int CalculatePersonalizedScore(int uniqueUsers, int totalSimilarUsers)
        {
            if (totalSimilarUsers == 0) return 0;
            return (int)Math.Round((double)uniqueUsers / totalSimilarUsers * 100);
        }
    }

    public class SoundRecommendation
    {
        public string SoundHash { get; set; }
        public string SoundName { get; set; }
        public int Score { get; set; } // 0-100%
        public string Reason { get; set; }
    }
}
