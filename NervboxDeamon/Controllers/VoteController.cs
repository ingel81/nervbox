using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NervboxDeamon.Models;
using NervboxDeamon.Services.Interfaces;

namespace NervboxDeamon.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class VoteController : ControllerBase
    {
        private readonly IVoteService _voteService;
        private readonly IUserService _userService;

        public VoteController(IVoteService voteService, IUserService userService)
        {
            _voteService = voteService;
            _userService = userService;
        }

        /// <summary>
        /// Vote on a sound (upvote or downvote)
        /// </summary>
        [HttpPost("{soundHash}")]
        [Authorize]
        public async Task<ActionResult<VoteResult>> Vote(string soundHash, [FromBody] VoteRequest request)
        {
            var userId = _userService.GetCurrentUserId();
            if (userId == null)
            {
                return Unauthorized();
            }

            var result = await _voteService.VoteAsync(userId.Value, soundHash, request.VoteValue);
            if (!result.Success)
            {
                return BadRequest(result);
            }

            return Ok(result);
        }

        /// <summary>
        /// Remove a vote from a sound
        /// </summary>
        [HttpDelete("{soundHash}")]
        [Authorize]
        public async Task<ActionResult<VoteResult>> RemoveVote(string soundHash)
        {
            var userId = _userService.GetCurrentUserId();
            if (userId == null)
            {
                return Unauthorized();
            }

            var result = await _voteService.RemoveVoteAsync(userId.Value, soundHash);
            return Ok(result);
        }

        /// <summary>
        /// Get vote statistics for a sound
        /// </summary>
        [HttpGet("{soundHash}")]
        public async Task<ActionResult<SoundVoteStats>> GetVoteStats(string soundHash)
        {
            var stats = await _voteService.GetVoteStatsAsync(soundHash);
            return Ok(stats);
        }

        /// <summary>
        /// Get all votes for the current user
        /// </summary>
        [HttpGet("user")]
        [Authorize]
        public async Task<ActionResult<Dictionary<string, int>>> GetUserVotes()
        {
            var userId = _userService.GetCurrentUserId();
            if (userId == null)
            {
                return Unauthorized();
            }

            var votes = await _voteService.GetUserVotesAsync(userId.Value);
            return Ok(votes);
        }

        /// <summary>
        /// Get top-rated sounds
        /// </summary>
        [HttpGet("statistics/toprated")]
        public async Task<ActionResult<List<SoundWithVotes>>> GetTopRated([FromQuery] int limit = 25)
        {
            var sounds = await _voteService.GetTopRatedSoundsAsync(limit);
            return Ok(sounds);
        }

        /// <summary>
        /// Get bottom-rated sounds
        /// </summary>
        [HttpGet("statistics/bottomrated")]
        public async Task<ActionResult<List<SoundWithVotes>>> GetBottomRated([FromQuery] int limit = 25)
        {
            var sounds = await _voteService.GetBottomRatedSoundsAsync(limit);
            return Ok(sounds);
        }
    }
}
