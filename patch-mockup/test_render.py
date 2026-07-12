"""Smoke test: render a synthetic badge across patch types and print routing + warnings."""
import io
from PIL import Image, ImageDraw, ImageFont
from app.pipeline.mockup import generate

W,H=900,700
img=Image.new("RGBA",(W,H),(0,0,0,0)); d=ImageDraw.Draw(img)
d.ellipse([90,40,810,660],fill=(21,42,85,255))
d.polygon([(180,520),(400,220),(520,400),(610,300),(760,520)],fill=(46,158,68,255))
d.polygon([(360,275),(400,220),(445,282),(400,330)],fill=(244,244,242,255))
d.ellipse([560,120,680,240],fill=(242,183,5,255))
d.rectangle([180,520,760,560],fill=(212,42,47,255))
try: f=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",76)
except: f=ImageFont.load_default()
d.text((470,578),"PANDA",font=f,fill=(244,244,242,255),anchor="mm")
buf=io.BytesIO(); img.save(buf,"PNG"); art=buf.getvalue()

for pt in ["Embroidered","3D Embroidery Puff","PVC","Woven","Chenille","Sequin","Leather","Printed"]:
    r=generate(art, patch_type=pt, width_mm=80)
    print(f"{pt:20s} -> {r['category']:16s} style={r['mockup_style']:11s} next={r['production_file']:11s} colors={len(r['colors'])} warns={len(r['warnings'])}")
