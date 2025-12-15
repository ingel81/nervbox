namespace NervboxDeamon.Models.View
{
    public class TagCreateModel
    {
        public string Name { get; set; }
        public string Color { get; set; }
    }

    public class TagUpdateModel
    {
        public string Name { get; set; }
        public string Color { get; set; }
    }

    public class SoundUpdateModel
    {
        public string Name { get; set; }
        public bool? Enabled { get; set; }
        public string[] Tags { get; set; }
    }
}
