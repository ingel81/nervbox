using Microsoft.EntityFrameworkCore.Migrations;

namespace NervboxDeamon.Migrations
{
    public partial class playedby : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "initiator",
                table: "soundusage");

            migrationBuilder.AddColumn<int>(
                name: "playedByUserId",
                table: "soundusage",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_soundusage_playedByUserId",
                table: "soundusage",
                column: "playedByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_soundusage_users_playedByUserId",
                table: "soundusage",
                column: "playedByUserId",
                principalTable: "users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_soundusage_users_playedByUserId",
                table: "soundusage");

            migrationBuilder.DropIndex(
                name: "IX_soundusage_playedByUserId",
                table: "soundusage");

            migrationBuilder.DropColumn(
                name: "playedByUserId",
                table: "soundusage");

            migrationBuilder.AddColumn<string>(
                name: "initiator",
                table: "soundusage",
                type: "text",
                nullable: true);
        }
    }
}
