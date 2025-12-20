using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NervboxDeamon.DbModels;
using NervboxDeamon.Hubs;
using NervboxDeamon.Models;
using NervboxDeamon.Services.Interfaces;

namespace NervboxDeamon.Services
{
    public class VoteService : IVoteService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<VoteService> _logger;
        private readonly IHubContext<SoundHub> _soundHub;
        private readonly ICreditService _creditService;
        private readonly IAchievementService _achievementService;

        private const int CreditsPerUpvote = 2;

        public VoteService(
            IServiceProvider serviceProvider,
            ILogger<VoteService> logger,
            IHubContext<SoundHub> soundHub,
            ICreditService creditService,
            IAchievementService achievementService)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
            _soundHub = soundHub;
            _creditService = creditService;
            _achievementService = achievementService;
        }

        public async Task<VoteResult> VoteAsync(int userId, string soundHash, int voteValue)
        {
            if (voteValue != 1 && voteValue != -1)
            {
                return new VoteResult
                {
                    Success = false,
                    Error = "Vote value must be 1 (upvote) or -1 (downvote)"
                };
            }

            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            // Check if sound exists
            var sound = await db.Sounds.FirstOrDefaultAsync(s => s.Hash == soundHash);
            if (sound == null)
            {
                return new VoteResult
                {
                    Success = false,
                    Error = "Sound not found"
                };
            }

            // Check for existing vote
            var existingVote = await db.SoundVotes
                .FirstOrDefaultAsync(v => v.UserId == userId && v.SoundHash == soundHash);

            int? creditsEarned = null;
            bool isNewUpvote = false;

            if (existingVote != null)
            {
                // User already voted - update vote
                if (existingVote.VoteValue == voteValue)
                {
                    // Same vote, no change needed
                    var stats = await GetVoteStatsInternalAsync(db, soundHash);
                    return new VoteResult
                    {
                        Success = true,
                        UpVotes = stats.UpVotes,
                        DownVotes = stats.DownVotes,
                        Score = stats.Score,
                        UserVote = voteValue
                    };
                }

                // Check if changing from downvote to upvote (grant credits)
                if (existingVote.VoteValue == -1 && voteValue == 1)
                {
                    isNewUpvote = true;
                }

                existingVote.VoteValue = voteValue;
                existingVote.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                // New vote
                var newVote = new SoundVote
                {
                    UserId = userId,
                    SoundHash = soundHash,
                    VoteValue = voteValue,
                    VotedAt = DateTime.UtcNow
                };
                db.SoundVotes.Add(newVote);

                if (voteValue == 1)
                {
                    isNewUpvote = true;
                }
            }

            await db.SaveChangesAsync();

            // Grant credits to sound author for upvote
            if (isNewUpvote && sound.AuthorId.HasValue && sound.AuthorId.Value != userId)
            {
                _creditService.AddCredits(
                    sound.AuthorId.Value,
                    CreditsPerUpvote,
                    CreditTransactionType.SoundUpvoteReceived,
                    $"Upvote für Sound: {sound.Name}",
                    soundHash);

                creditsEarned = CreditsPerUpvote;

                // Check for achievement
                _achievementService.GrantAchievement(sound.AuthorId.Value, "sound_upvoted");
            }

            // Get updated stats
            var updatedStats = await GetVoteStatsInternalAsync(db, soundHash);

            // Broadcast vote update
            await BroadcastVoteUpdateAsync(soundHash, updatedStats);

            _logger.LogInformation("User {UserId} voted {VoteValue} on sound {SoundHash}",
                userId, voteValue, soundHash);

            return new VoteResult
            {
                Success = true,
                UpVotes = updatedStats.UpVotes,
                DownVotes = updatedStats.DownVotes,
                Score = updatedStats.Score,
                UserVote = voteValue,
                CreditsEarned = creditsEarned
            };
        }

        public async Task<VoteResult> RemoveVoteAsync(int userId, string soundHash)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            var existingVote = await db.SoundVotes
                .FirstOrDefaultAsync(v => v.UserId == userId && v.SoundHash == soundHash);

            if (existingVote == null)
            {
                var currentStats = await GetVoteStatsInternalAsync(db, soundHash);
                return new VoteResult
                {
                    Success = true,
                    UpVotes = currentStats.UpVotes,
                    DownVotes = currentStats.DownVotes,
                    Score = currentStats.Score,
                    UserVote = null
                };
            }

            db.SoundVotes.Remove(existingVote);
            await db.SaveChangesAsync();

            var updatedStats = await GetVoteStatsInternalAsync(db, soundHash);

            // Broadcast vote update
            await BroadcastVoteUpdateAsync(soundHash, updatedStats);

            _logger.LogInformation("User {UserId} removed vote on sound {SoundHash}", userId, soundHash);

            return new VoteResult
            {
                Success = true,
                UpVotes = updatedStats.UpVotes,
                DownVotes = updatedStats.DownVotes,
                Score = updatedStats.Score,
                UserVote = null
            };
        }

        public async Task<SoundVoteStats> GetVoteStatsAsync(string soundHash)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();
            return await GetVoteStatsInternalAsync(db, soundHash);
        }

        public async Task<Dictionary<string, SoundVoteStats>> GetVoteStatsForSoundsAsync(IEnumerable<string> soundHashes)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            var hashList = soundHashes.ToList();

            var votes = await db.SoundVotes
                .Where(v => hashList.Contains(v.SoundHash))
                .GroupBy(v => v.SoundHash)
                .Select(g => new
                {
                    SoundHash = g.Key,
                    UpVotes = g.Count(v => v.VoteValue == 1),
                    DownVotes = g.Count(v => v.VoteValue == -1)
                })
                .ToListAsync();

            var result = new Dictionary<string, SoundVoteStats>();

            foreach (var hash in hashList)
            {
                var stats = votes.FirstOrDefault(v => v.SoundHash == hash);
                result[hash] = new SoundVoteStats
                {
                    SoundHash = hash,
                    UpVotes = stats?.UpVotes ?? 0,
                    DownVotes = stats?.DownVotes ?? 0,
                    Score = (stats?.UpVotes ?? 0) - (stats?.DownVotes ?? 0)
                };
            }

            return result;
        }

        public async Task<int?> GetUserVoteAsync(int userId, string soundHash)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            var vote = await db.SoundVotes
                .FirstOrDefaultAsync(v => v.UserId == userId && v.SoundHash == soundHash);

            return vote?.VoteValue;
        }

        public async Task<Dictionary<string, int>> GetUserVotesAsync(int userId)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            return await db.SoundVotes
                .Where(v => v.UserId == userId)
                .ToDictionaryAsync(v => v.SoundHash, v => v.VoteValue);
        }

        public async Task<List<SoundWithVotes>> GetTopRatedSoundsAsync(int limit = 25)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            var soundsWithVotes = await db.Sounds
                .Where(s => s.Enabled)
                .Select(s => new
                {
                    s.Hash,
                    s.Name,
                    UpVotes = s.Votes.Count(v => v.VoteValue == 1),
                    DownVotes = s.Votes.Count(v => v.VoteValue == -1)
                })
                .ToListAsync();

            return soundsWithVotes
                .Select(s => new SoundWithVotes
                {
                    Hash = s.Hash,
                    Name = s.Name,
                    UpVotes = s.UpVotes,
                    DownVotes = s.DownVotes,
                    Score = s.UpVotes - s.DownVotes
                })
                .OrderByDescending(s => s.Score)
                .ThenByDescending(s => s.UpVotes)
                .Take(limit)
                .ToList();
        }

        public async Task<List<SoundWithVotes>> GetBottomRatedSoundsAsync(int limit = 25)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NervboxDBContext>();

            var soundsWithVotes = await db.Sounds
                .Where(s => s.Enabled)
                .Select(s => new
                {
                    s.Hash,
                    s.Name,
                    UpVotes = s.Votes.Count(v => v.VoteValue == 1),
                    DownVotes = s.Votes.Count(v => v.VoteValue == -1)
                })
                .ToListAsync();

            return soundsWithVotes
                .Select(s => new SoundWithVotes
                {
                    Hash = s.Hash,
                    Name = s.Name,
                    UpVotes = s.UpVotes,
                    DownVotes = s.DownVotes,
                    Score = s.UpVotes - s.DownVotes
                })
                .OrderBy(s => s.Score)
                .ThenByDescending(s => s.DownVotes)
                .Take(limit)
                .ToList();
        }

        private async Task<SoundVoteStats> GetVoteStatsInternalAsync(NervboxDBContext db, string soundHash)
        {
            var votes = await db.SoundVotes
                .Where(v => v.SoundHash == soundHash)
                .ToListAsync();

            var upVotes = votes.Count(v => v.VoteValue == 1);
            var downVotes = votes.Count(v => v.VoteValue == -1);

            return new SoundVoteStats
            {
                SoundHash = soundHash,
                UpVotes = upVotes,
                DownVotes = downVotes,
                Score = upVotes - downVotes
            };
        }

        private async Task BroadcastVoteUpdateAsync(string soundHash, SoundVoteStats stats)
        {
            try
            {
                await _soundHub.Clients.All.SendAsync("voteUpdate", new
                {
                    SoundHash = soundHash,
                    stats.UpVotes,
                    stats.DownVotes,
                    stats.Score,
                    Timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to broadcast vote update for sound {SoundHash}", soundHash);
            }
        }
    }
}
