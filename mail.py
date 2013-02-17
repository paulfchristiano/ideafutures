import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

user = 'kshaunak@gmail.com'
# Temporary application-specific password which will be revoked soon.
password = 'okymnakpupxhfkjs'

smtp = None

def connect_to_mail_server():
  global smtp
  smtp = smtplib.SMTP('smtp.gmail.com', 587)
  smtp.starttls()
  smtp.login(user, password)

# Sends an HTML email.
def send_mail(to, subject, text, html=None):
  global smtp
  if not smtp:
    connect_to_mail_server()
 
  msg = MIMEMultipart('alternative')
  msg['Subject'] = subject
  msg['From'] = 'predictionbazaar.com admin <%s>' % (user,)
  msg['To'] = to

  msg.attach(MIMEText(text, 'plain'))
  if html:
    msg.attach(MIMEText(html, 'html'))

  try:
    smtp.sendmail(user, to, msg.as_string())
  except (smtplib.SMTPServerDisconnected, smtplib.SMTPException):
    connect_to_mail_server()
    smtp.sendmail(user, to, msg.as_string())
