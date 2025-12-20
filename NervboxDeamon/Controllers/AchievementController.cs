using System;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NervboxDeamon.Controllers.Base;
using NervboxDeamon.DbModels;
using NervboxDeamon.Services.Interfaces;

namespace NervboxDeamon.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AchievementController : NervboxBaseController<AchievementController>
    {
        private readonly IAchievementService _achievementService;

        public AchievementController(IAchievementService achievementService)
        {
            _achievementService = achievementService;
        }

        /// <summary>
        /// GET /api/achievement - Get all available achievements
        /// </summary>
        [HttpGet]
        [AllowAnonymous]
        public IActionResult GetAllAchievements()
        {
            try
            {
                var achievements = _achievementService.GetAllAchievements()
                    .Select(a => new
                    {
                        a.Id,
                        a.Name,
                        a.Description,
                        a.Icon,
                        Category = a.Category.ToString(),
                        a.Tier,
                        a.Threshold,
                        a.SortOrder,
                        a.RewardCredits
                    });

                return Ok(achievements);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/achievement/category/{category} - Get achievements by category
        /// </summary>
        [HttpGet("category/{category}")]
        [AllowAnonymous]
        public IActionResult GetAchievementsByCategory(string category)
        {
            try
            {
                if (!Enum.TryParse<AchievementCategory>(category, true, out var categoryEnum))
                {
                    return BadRequest(new { Error = "Invalid category" });
                }

                var achievements = _achievementService.GetAchievementsByCategory(categoryEnum)
                    .Select(a => new
                    {
                        a.Id,
                        a.Name,
                        a.Description,
                        a.Icon,
                        Category = a.Category.ToString(),
                        a.Tier,
                        a.Threshold,
                        a.SortOrder,
                        a.RewardCredits
                    });

                return Ok(achievements);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/achievement/user - Get current user's achievements
        /// </summary>
        [HttpGet("user")]
        [Authorize]
        public IActionResult GetMyAchievements()
        {
            try
            {
                var achievements = _achievementService.GetUserAchievements(UserId)
                    .Select(ua => new
                    {
                        ua.AchievementId,
                        ua.EarnedAt,
                        ua.ProgressValue
                    });

                return Ok(achievements);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/achievement/user/{userId} - Get a specific user's achievements (public)
        /// </summary>
        [HttpGet("user/{userId}")]
        [AllowAnonymous]
        public IActionResult GetUserAchievements(int userId)
        {
            try
            {
                // Check if user exists
                var user = DbContext.Users.Find(userId);
                if (user == null || user.Role == "system")
                {
                    return NotFound(new { Error = "User not found" });
                }

                var userAchievements = _achievementService.GetUserAchievements(userId)
                    .Select(ua => new
                    {
                        ua.AchievementId,
                        ua.EarnedAt,
                        ua.ProgressValue
                    })
                    .ToList();

                var allAchievements = _achievementService.GetAllAchievements()
                    .Select(a => new
                    {
                        a.Id,
                        a.Name,
                        a.Description,
                        a.Icon,
                        Category = a.Category.ToString(),
                        a.Tier,
                        a.Threshold,
                        a.SortOrder,
                        a.RewardCredits,
                        Earned = userAchievements.Any(ua => ua.AchievementId == a.Id),
                        EarnedAt = userAchievements.FirstOrDefault(ua => ua.AchievementId == a.Id)?.EarnedAt
                    });

                return Ok(new
                {
                    UserId = userId,
                    Username = user.Username,
                    TotalEarned = userAchievements.Count,
                    TotalAvailable = allAchievements.Count(),
                    Achievements = allAchievements
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/achievement/progress - Get current user's progress toward achievements
        /// </summary>
        [HttpGet("progress")]
        [Authorize]
        public IActionResult GetMyProgress()
        {
            try
            {
                var progress = _achievementService.GetUserProgress(UserId);
                return Ok(progress);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        /// <summary>
        /// POST /api/achievement/tour-completed - Mark guided tour as completed
        /// </summary>
        [HttpPost("tour-completed")]
        [Authorize]
        public IActionResult MarkTourCompleted()
        {
            try
            {
                _achievementService.CheckTourCompletedAchievement(UserId);
                return Ok(new { Success = true });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        /// <summary>
        /// POST /api/achievement/mixer-visited - Mark mixer as visited
        /// </summary>
        [HttpPost("mixer-visited")]
        [Authorize]
        public IActionResult MarkMixerVisited()
        {
            try
            {
                _achievementService.CheckMixerAchievements(UserId, visitedMixer: true, createdSound: false);
                return Ok(new { Success = true });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/achievement/categories - Get all achievement categories
        /// </summary>
        [HttpGet("categories")]
        [AllowAnonymous]
        public IActionResult GetCategories()
        {
            try
            {
                var categories = Enum.GetValues<AchievementCategory>()
                    .Select(c => new
                    {
                        Id = c.ToString(),
                        Name = GetCategoryDisplayName(c)
                    });

                return Ok(categories);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        private static string GetCategoryDisplayName(AchievementCategory category)
        {
            return category switch
            {
                AchievementCategory.General => "Allgemein",
                AchievementCategory.SoundPlayback => "Sound-Wiedergabe",
                AchievementCategory.SoundCreation => "Sound-Erstellung",
                AchievementCategory.MiniGames => "Minispiele",
                AchievementCategory.Gambling => "Glücksspiel",
                AchievementCategory.Chat => "Chat",
                AchievementCategory.Social => "Sozial",
                AchievementCategory.Wealth => "Vermögen",
                _ => category.ToString()
            };
        }
    }
}
