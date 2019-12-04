using Microsoft.EntityFrameworkCore.Migrations;

namespace NervboxDeamon.Migrations
{
    public partial class ipreg : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RegistrationIp",
                table: "users",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RegistrationIp",
                table: "users");
        }
    }
}
